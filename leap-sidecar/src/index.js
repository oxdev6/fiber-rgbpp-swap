// Leap sidecar: narrow localhost API over the audited @ckb-ccc/rgbpp SDK.
// L1 (done): routing + validation + job tracking, GET /env proves SDK integration.
// L2a (done): testnet3 scripts bundled, BTC wallet address endpoint (persistent).
// L2b (next, blocked on funding): real issuance/leap execution
//   (commitment build, BTC broadcast, SPV polling) — needs funded BTC UTXO.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";

const bip32Lib = BIP32Factory(ecc);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const WALLET_FILE = path.join(HERE, "..", ".btc-mnemonic");

const RGBPP_VERSION = (() => {
  try {
    // Read straight from disk (package exports map hides internals).
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(HERE, "..", "node_modules", "@ckb-ccc", "rgbpp", "package.json"),
        "utf8",
      ),
    );
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
})();

const jobs = new Map(); // id -> { id, params, status, createdAt, updatedAt, result?, error? }
let seq = 0;

let btcWallet = null;

function loadOrCreateMnemonic() {
  if (process.env.BTC_MNEMONIC) return { mnemonic: process.env.BTC_MNEMONIC, source: "env" };
  try {
    const saved = fs.readFileSync(WALLET_FILE, "utf8").trim();
    if (saved) return { mnemonic: saved, source: "file" };
  } catch {
    // fall through to generation
  }
  const mnemonic = bip39.generateMnemonic();
  fs.writeFileSync(WALLET_FILE, mnemonic + "\n", { mode: 0o600 });
  return { mnemonic, source: "generated" };
}

async function initBtcWallet() {
  if (btcWallet) return btcWallet;
  const { mnemonic, source } = loadOrCreateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const network = bitcoin.networks.testnet;
  const masterKey = bip32Lib.fromSeed(seed, network);
  const childKey = masterKey.derivePath("m/84'/1'/0'/0/0");
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: childKey.publicKey,
    network,
  });
  const privateKey = Buffer.from(childKey.privateKey).toString("hex");
  btcWallet = { mnemonic, source, address, privateKey };
  return btcWallet;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, sidecar: "0.1.0", rgbpp: RGBPP_VERSION });
    }

    if (req.method === "GET" && url.pathname === "/env") {
      // L2a: prove SDK integration live — build network config + resolve
      // script templates. No keys, no chain calls.
      const { PredefinedNetwork } = await import("@ckb-ccc/rgbpp");
      const { buildConfig } = await import("./rgbpp-net.js");
      const chain =
        process.env.UTXO_BASED_CHAIN_NAME || PredefinedNetwork.BitcoinTestnet3;
      const cfg = buildConfig(chain);
      return send(res, 200, {
        chain: cfg.name,
        isMainnet: cfg.isMainnet,
        btcDustLimit: String(cfg.btcDustLimit),
        btcFeeRate: String(cfg.btcFeeRate),
        scripts: Object.keys(cfg.scripts || {}),
      });
    }

    if (req.method === "GET" && url.pathname === "/btc-address") {
      const w = await initBtcWallet();
      const includeMnemonic = url.searchParams.get("include_mnemonic") === "1";
      const out = {
        address: w.address,
        derivationPath: "m/84'/1'/0'/0/0",
        network: "bitcoin-testnet3 (P2WPKH)",
        mnemonicSource: w.source,
        faucetHint: "Fund with testnet3 BTC (dust 546 sats per seal + fee). Faucet: https://bitcoinfaucet.uo1.net/",
      };
      if (includeMnemonic) out.mnemonic = w.mnemonic;
      return send(res, 200, out);
    }

    if (req.method === "POST" && url.pathname === "/mint") {
      const p = await readBody(req);
      // Future L2b params: token metadata + destination CKB *address* (not script).
      if (!p || typeof p !== "object" || !p.token || !p.amount || !p.ckb_address) {
        return send(res, 400, {
          error: "need { token: {name, symbol, decimal}, amount, ckb_address }",
        });
      }
      if (typeof p.ckb_address !== "string" || !p.ckb_address.startsWith("ckt")) {
        return send(res, 400, { error: "ckb_address must be a ckt... testnet address string" });
      }
      const id = `mint-${Date.now().toString(36)}-${++seq}`;
      const now = Date.now();
      jobs.set(id, {
        id,
        params: p,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        note: "L2b pending: needs funded BTC UTXO (546 sats dust) at GET /btc-address",
      });
      return send(res, 202, { id, status: "queued" });
    }

    if (req.method === "POST" && url.pathname === "/leap") {
      const p = await readBody(req);
      // NOTE: SDK seal shape is { txId, index }. Accept { txid, vout } alias,
      // normalize on ingest so L2 cannot build a bad commitment.
      // Destination must be a ckt... address string (buildBtcTimeLockScript
      // takes an address, not a script object).
      const utxo = p && typeof p === "object" ? p.btc_utxo : null;
      const txId = utxo?.txId ?? utxo?.txid;
      const index = utxo?.index ?? utxo?.vout;
      if (!p || typeof p !== "object" || typeof txId !== "string" || !Number.isInteger(index)) {
        return send(res, 400, {
          error: "need { btc_utxo: {txId, index} (alias: {txid, vout}), to_ckb_address: 'ckt...' }",
        });
      }
      if (typeof p.to_ckb_address !== "string" || !p.to_ckb_address.startsWith("ckt")) {
        return send(res, 400, { error: "to_ckb_address must be a ckt... testnet address string" });
      }
      const id = `leap-${Date.now().toString(36)}-${++seq}`;
      const now = Date.now();
      jobs.set(id, {
        id,
        params: { btc_utxo: { txId, index }, to_ckb_address: p.to_ckb_address },
        status: "queued",
        createdAt: now,
        updatedAt: now,
        note: "L2 pending: BTC tx + SPV wait + CKB unlock not yet executed",
      });
      return send(res, 202, { id, status: "queued" });
    }

    const lm = url.pathname.match(/^\/leap\/([\w-]+)$/);
    if (req.method === "GET" && lm) {
      const job = jobs.get(lm[1]);
      if (!job) return send(res, 404, { error: "unknown job" });
      return send(res, 200, job);
    }

    const jm = url.pathname.match(/^\/mint\/([\w-]+)$/);
    if (req.method === "GET" && jm) {
      const job = jobs.get(jm[1]);
      if (!job) return send(res, 404, { error: "unknown job" });
      return send(res, 200, job);
    }

    return send(res, 404, { error: "unknown route" });
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) });
  }
});

process.on("unhandledRejection", (e) => {
  console.error("[sidecar] unhandledRejection:", e?.message || e);
});

const PORT = Number(process.env.LEAP_PORT || 8399);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`leap-sidecar listening on 127.0.0.1:${PORT} (rgbpp ${RGBPP_VERSION})`);
});
