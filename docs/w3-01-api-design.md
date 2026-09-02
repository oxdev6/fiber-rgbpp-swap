# W3-01 — Discovery API Design

**Goal:** Define `list_offers` / `best_rate` surface for Week 3.

**Files:** `crates/fiber-lib/src/fiber/swap_advertisement.rs` (new), `crates/fiber-lib/src/rpc/swap_ad.rs` (new), `crates/fiber-json-types/src/swap_ad.rs` (new view), `crates/fiber-cli/src/args.rs`.

## Data Types

### SwapOfferView (RPC view, serde)
```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SwapOfferView {
    pub base_udt_script: Option<Script>, // None => CKB native (future)
    pub quote_udt_script: Option<Script>,
    pub rate: String, // u128 as decimal string (JS safe, 1e8 denom)
    pub rate_raw: u128, // raw for sorting (optional, not serialized if JS)
    pub fee_rate: String, // per million
    pub operator_pubkey: Pubkey, // 33 hex
    pub timestamp: u64, // millis
    pub expiry: u64,
    pub chain_hash: Hash256,
    pub is_expired: bool, // derived at query time
}
impl From<SwapAdvertisement> for SwapOfferView { /* expiry check via now */ }
```

**Denom:** `rate` = `quote per base * 1e8` (as `docs/schema-draft.md:2`). Example `rate=10_000_000_000` => 100 quote per base.

### AssetPairFilter (query)
```rust
#[derive(Deserialize, Serialize, Default)]
pub struct AssetPairFilter {
    pub base_code_hash: Option<Byte32>,
    pub base_args: Option<String>, // hex regex or exact, for W3 exact match only
    pub quote_code_hash: Option<Byte32>,
    pub quote_args: Option<String>,
}
// W3 minimal: filter = Option<AssetPairFilter> where None => all, Some => exact ScriptOpt match via code_hash+args equality.
// Future: regex like UdtCfgInfos.
```

## Store / Index API

```rust
// crates/fiber-lib/src/fiber/swap_advertisement.rs
pub struct SwapAdIndex<S: GossipMessageStore> { store: S }

impl<S: GossipMessageStore> SwapAdIndex<S> {
    pub fn new(store: S) -> Self { Self { store } }
    pub fn list_offers(&self, filter: Option<AssetPairFilter>, now: u64) -> Vec<SwapAdvertisement> {
        // store.get_active_swap_advertisements(now) -> filter
    }
    pub fn best_rate(&self, base: &Option<Script>, quote: &Option<Script>, now: u64) -> Option<SwapAdvertisement> {
        // list_offers with exact pair, max by rate
    }
}
```

**Store trait** (`gossip.rs:340` + `store_impl/mod.rs:1851` already has `save_swap_advertisement`):
```rust
fn get_swap_advertisements(&self, after_cursor: Option<&Cursor>, limit: usize) -> Vec<(Cursor, SwapAdvertisement)>;
fn get_active_swap_advertisements(&self, now: u64) -> Vec<SwapAdvertisement> {
    self.get_swap_advertisements(None, 0).into_iter()
        .filter(|(_, ad)| !ad.is_expired(now))
        .map(|(_, ad)| ad).collect()
}
```

## RPC (jsonrpsee)

New trait `SwapAdRpc` in `crates/fiber-lib/src/rpc/swap_ad.rs`:
```rust
#[rpc(server, namespace = "swap_ad")]
pub trait SwapAdRpc {
    #[method(name = "publishSwapAdvertisement")]
    async fn publish_swap_advertisement(
        &self,
        base_udt_script: Option<Script>,
        quote_udt_script: Option<Script>,
        rate: u128,
        fee_rate: u128,
        expiry_delta_millis: u64,
    ) -> Result<SwapAdvertisement, Error>;

    #[method(name = "listSwapAdvertisements")]
    async fn list_swap_advertisements(
        &self,
        filter: Option<AssetPairFilter>,
    ) -> Result<Vec<SwapOfferView>, Error>;

    #[method(name = "getBestSwapRate")]
    async fn get_best_swap_rate(
        &self,
        base_udt_script: Option<Script>,
        quote_udt_script: Option<Script>,
    ) -> Result<Option<SwapOfferView>, Error>;
}
```

**Publish handler steps:**
1. `chain_hash = get_chain_hash()`
2. `privkey = CkbConfig::read_secret_key()?` (via `NetworkActor` or `CkbConfig` injected)
3. `now = now_timestamp_as_millis_u64()`, `expiry = now + expiry_delta_millis`
4. `SwapAdvertisement::new_signed(chain_hash, base, quote, rate, fee_rate, &privkey, now, expiry)`
5. `verify()` + not expired + `rate!=0`
6. `store.save_swap_advertisement(ad.clone())`
7. `gossip_actor.send(TryBroadcastMessages(vec![SwapAdvertisement(ad Clone)]))`
8. Return `ad` (or `SwapOfferView`).

**List/Best handlers:** `now = now_timestamp_as_millis_u64()`, `SwapAdIndex::new(store.clone()).list_offers(filter, now)` or `best_rate`, map to `SwapOfferView` via `From` + `is_expired`.

**Registration:** `crates/fiber-lib/src/rpc/mod.rs` add `SwapAdRpcServer` to `RpcServer` impl.

**View type location:** `crates/fiber-json-types/src/swap_ad.rs` (new) re-exported via `fiber-json-types` for RPC.

## CLI

`crates/fiber-cli/src/main.rs` (or `args.rs`):
```
fiber-cli swap-ad publish --base <script-json> --quote <script-json> --rate 10000000000 --fee-rate 3000 --expiry-delta 86400000 --rpc 127.0.0.1:8327
fiber-cli swap-ad list [--base <json> --quote <json>] --rpc 127.0.0.1:8328
fiber-cli swap-ad best --base <json> --quote <json> --rpc 127.0.0.1:8328
```
- `--script-json` is `{"code_hash":"0x...","hash_type":"type","args":"0x..."}` or `null` for None.
- W3 minimal implements `list` + `best` only; `publish` can be via RPC curl initially.

**Output:** Table `operator_pubkey | rate | fee_rate | expiry` + JSON `--json` flag.

## Example RPC JSON

**Publish request:**
```json
{"id":1,"jsonrpc":"2.0","method":"swap_ad_publishSwapAdvertisement","params":[{"base_udt_script":null,"quote_udt_script":{"code_hash":"0x...","hash_type":"type","args":"0x..."},"rate":10000000000,"fee_rate":3000,"expiry_delta_millis":86400000}]}
```
**List response:**
```json
{"id":1,"result":[{"base_udt_script":null,"quote_udt_script":{...},"rate":"10000000000","fee_rate":"3000","operator_pubkey":"02ab...","timestamp":1725110400000,"expiry":1725196800000,"chain_hash":"0x...","is_expired":false}]}
```

## Verification

- `cat docs/w3-01-api-design.md` shows 3 RPC + 2 CLI defined.
- `cargo check -p fnn` passes after W3-02/03/04/05.
- CLI `fiber-cli swap-ad --help` shows subcommands.

