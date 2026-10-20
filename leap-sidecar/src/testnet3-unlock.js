// TESTNET3 RGB++ xUDT UNLOCK (BTC-Time lock -> plain CKB lock).
//
// Spends the BTC-Time-locked xUDT cell produced by the leap and returns the
// asset to the lock embedded in the BTC-Time args (the owner lock), after the
// leap BTC tx has >= `after` confirmations. Mirrors @ckb-ccc/rgbpp example 4.
//
// Usage:
//   node src/testnet3-unlock.js [--cell <tx>:<idx>] [--dry] [--diag]
import fs from "node:fs";
import path from "node:path";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import * as ccc from "@ckb-ccc/core";
import {
  PredefinedNetwork,
  PredefinedScriptName,
  PrivateKeyRgbppBtcWallet,
  RgbppUdtClient,
  buildBtcTimeUnlockWitness,
  parseBtcTimeLockArgs,
  pollForSpvProof,
  deduplicateByOutPoint,
} from "@ckb-ccc/rgbpp";
import { buildConfig } from "./rgbpp-net.js";

const bip32Lib = BIP32Factory(ecc);
const HERE = path.dirname(new URL(import.meta.url).pathname);

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
// leap output[0] of the leap CKB tx
const CELL_ARG = arg("cell", "0xa3e94654f5d4d3db242671249cd52a3157e99f63e6e339880142b3041ae111c1:0");
const dry = process.argv.includes("--dry");
const diag = process.argv.includes("--diag");

// Valid empty XudtWitness { owner_script: None, extension_scripts: None }.
// The SDK's "" serializes to Some(0x); the xUDT script fails MOL_ERR_DATA (7)
// when it must parse that field with the xUDT on an input.
const EMPTY_XUDT_WITNESS = "0x080000000800000008000000";

const loadBtcPrivkey = () => {
  const m = process.env.BTC_MNEMONIC || fs.readFileSync(path.join(HERE, "..", ".btc-mnemonic"), "utf8").trim();
  return Buffer.from(
    bip32Lib.fromSeed(bip39.mnemonicToSeedSync(m), bitcoin.networks.testnet)
      .derivePath("m/84'/1'/0'/0/0").privateKey,
  ).toString("hex");
};
const loadCkbPrivkey = () => fs.readFileSync(path.join(HERE, "..", ".ckb-key"), "utf8").trim();

const log = (...a) => console.log("•", ...a);
const beHexToBig = (data) => BigInt("0x" + (Buffer.from(data.slice(2), "hex").reverse().toString("hex") || "0"));

async function main() {
  const client = new ccc.ClientPublicTestnet();
  const signer = new ccc.SignerCkbPrivateKey(client, loadCkbPrivkey());
  const cfg = buildConfig(PredefinedNetwork.BitcoinTestnet3);
  const udt = new RgbppUdtClient(cfg, client);
  const btcWallet = new PrivateKeyRgbppBtcWallet(loadBtcPrivkey(), "P2WPKH", cfg, {
    url: process.env.BTC_ASSETS_API_URL || "https://api-testnet.rgbpp.com",
    app: process.env.BTC_ASSETS_API_APP || "fiber-rgbpp-swap",
    domain: process.env.BTC_ASSETS_API_DOMAIN || "localhost",
    token: process.env.BTC_ASSETS_API_TOKEN,
  });
  const ckbAddr = (await signer.getRecommendedAddressObj()).toString();
  log("ckb:", ckbAddr);

  const udtCellDep = (await client.getKnownScript(ccc.KnownScript.XUdt)).cellDeps[0].cellDep;
  const btcTimeLockCellDep = udt.getRgbppScriptInfoByName(PredefinedScriptName.BtcTimeLock).cellDep;

  const outPoint = { txHash: CELL_ARG.split(":")[0], index: Number(CELL_ARG.split(":")[1]) };
  const cell = await client.getCellLive(outPoint);
  if (!cell) throw new Error(`cell not live: ${CELL_ARG}`);

  const parsed = parseBtcTimeLockArgs(cell.cellOutput.lock.args);
  log("btc-time-lock: after =", parsed.confirmations, "| leap btc tx =", parsed.btcTxId);
  log("asset:", beHexToBig(cell.outputData).toString(), "units | cap =", Number(cell.cellOutput.capacity) / 1e8, "CKB");
  log("return lock:", parsed.lock.codeHash.slice(0, 10), parsed.lock.args.slice(0, 18));

  const tx = ccc.Transaction.default();
  tx.addInput({ previousOutput: outPoint });
  tx.addOutput(
    { lock: parsed.lock, type: cell.cellOutput.type, capacity: cell.cellOutput.capacity },
    cell.outputData,
  );
  tx.cellDeps.push(udtCellDep);
  tx.cellDeps.push(btcTimeLockCellDep);
  tx.cellDeps.push(
    ccc.CellDep.from({ outPoint: { ...btcTimeLockCellDep.outPoint, index: 1 }, depType: btcTimeLockCellDep.depType }),
  );

  log("gathering SPV proof of the leap BTC tx (needs >= after confirmations)…");
  const spvProof = await pollForSpvProof(btcWallet, parsed.btcTxId, parsed.confirmations);
  if (!spvProof) throw new Error("failed to get SPV proof");
  log("spv proof ok");
  tx.cellDeps.push(ccc.CellDep.from({ outPoint: spvProof.spvClientOutpoint, depType: "code" }));

  const unlockWitness = buildBtcTimeUnlockWitness(spvProof.proof);
  const wa = ccc.WitnessArgs.fromBytes(unlockWitness);
  tx.witnesses.push(
    ccc.hexFrom(
      ccc.WitnessArgs.from({
        lock: wa.lock ?? "0x",
        inputType: EMPTY_XUDT_WITNESS,
        outputType: EMPTY_XUDT_WITNESS,
      }).toBytes(),
    ),
  );

  tx.cellDeps = deduplicateByOutPoint(tx.cellDeps);
  await tx.completeFeeBy(signer, 1500, undefined, { maxFeeRate: 100000 });

  log("final tx: in", tx.inputs.length, "out", tx.outputs.length);
  for (const [i, o] of tx.outputs.entries()) {
    log(`  out ${i} cap=${Number(o.capacity) / 1e8} type=${o.type ? o.type.codeHash.slice(0, 10) : "null"} lock=${o.lock.codeHash.slice(0, 10)} args=${o.lock.args.slice(0, 18)}`);
  }
  if (dry || diag) {
    log(dry ? "dry run ok (NOT broadcast)" : "diag done");
    return;
  }
  const signed = await signer.signTransaction(tx);
  const txHash = await signer.client.sendTransaction(signed);
  await client.waitTransaction(txHash);
  log("CKB unlock tx:", txHash);
  log("DONE — asset returned to plain lock");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("UNLOCK_FAIL:", e.message || e);
  console.error(e && e.stack ? e.stack : "");
  process.exit(1);
});
