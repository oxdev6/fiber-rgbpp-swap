// TESTNET3 RGB++ xUDT issuance — resumable, deterministic.
//
// Why this exists (root cause of the earlier error-66 stall):
//   A bare RGBPP-locked cell is only ~77 CKB (min capacity for the lock), but
//   an xUDT cell (+  metadata cell) needs ~378 CKB. The SDK commits the CKB
//   virtual tx's INPUT SET into the BTC OP_RETURN, so once `completeFeeBy`
//   pulls in a second input the on-chain commitment (error 66) no longer
//   matches. Two runs pick different fee inputs -> no resume is possible.
//   Fix: pre-fund the RGBPP cell so the issuance is single-input and stable.
//
// Phase 1: create (or reuse) a fat RGBPP cell -> build CKB partial tx ->
//          build+broadcast the BTC commitment tx -> persist state.
// Phase 2: rebuild the identical CKB tx, inject the BTC txid, gather SPV proof
//          (waits for confirmations), fee-cover, broadcast.
//
// Usage:
//   node src/testnet3-issue.js [phase1|phase2|all] [--seal TXID:IDX]
//                              [--amount N] [--cell-cap CKB] [--reset]
import fs from "node:fs";
import path from "node:path";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import * as ccc from "@ckb-ccc/core";
import {
  PredefinedNetwork,
  PrivateKeyRgbppBtcWallet,
  RgbppUdtClient,
  CkbRgbppUnlockSinger,
} from "@ckb-ccc/rgbpp";
import { buildConfig } from "./rgbpp-net.js";

const bip32Lib = BIP32Factory(ecc);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const STATE = path.join(HERE, "..", "..", "localnet", "testnet3-pending.json");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const rawPhase = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "all";
const phase = rawPhase.replace(/^phase/, "");
const sealArg = arg("seal", "d3434bf6320ec3bbcd6120be06285b3bcf057c6781e9b05594c43853fec6e63f:1");
const [sealTxId, sealIndex] = [sealArg.split(":")[0], Number(sealArg.split(":")[1])];
const amount = BigInt(arg("amount", "21000000"));
const cellCap = BigInt(arg("cell-cap", "500")) * 100000000n;
const token = {
  name: arg("name", "Fiber Swap Test"),
  symbol: arg("symbol", "FST"),
  decimal: Number(arg("decimals", "8")),
};
const reset = process.argv.includes("--reset");

const loadBtcPrivkey = () => {
  const m = process.env.BTC_MNEMONIC || fs.readFileSync(path.join(HERE, "..", ".btc-mnemonic"), "utf8").trim();
  return Buffer.from(
    bip32Lib.fromSeed(bip39.mnemonicToSeedSync(m), bitcoin.networks.testnet)
      .derivePath("m/84'/1'/0'/0/0").privateKey,
  ).toString("hex");
};
const loadCkbPrivkey = () => fs.readFileSync(path.join(HERE, "..", ".ckb-key"), "utf8").trim();

const log = (...a) => console.log("•", ...a);

async function createRgbppCell(client, signer, udt, seal, capacity) {
  // Reuse if a cell already exists for this seal (idempotent).
  const lock = udt.buildRgbppLockScript(seal);
  for await (const cell of client.findCellsByLock(lock)) {
    if (BigInt(cell.cellOutput.capacity) >= capacity) {
      log("reusing RGBPP cell", cell.outPoint.txHash.slice(0, 16), "cap", Number(cell.cellOutput.capacity) / 1e8);
      return cell;
    }
  }
  log("creating fat RGBPP cell, capacity", Number(capacity) / 1e8, "CKB");
  const tx = ccc.Transaction.default();
  tx.addOutput({ lock, capacity });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000, undefined, { maxFeeRate: 100000 });
  const h = await signer.client.sendTransaction(await signer.signTransaction(tx));
  await client.waitTransaction(h);
  const cell = await client.getCellLive({ txHash: h, index: 0 });
  if (!cell) throw new Error("RGBPP cell not found after creation");
  log("RGBPP cell tx", h);
  return cell;
}

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
  const btcAddr = await btcWallet.getAddress();
  log("ckb:", (await signer.getRecommendedAddressObj()).toString());
  log("btc:", btcAddr);

  const udtScriptInfo = {
    name: ccc.KnownScript.XUdt,
    script: await ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, ""),
    cellDep: (await client.getKnownScript(ccc.KnownScript.XUdt)).cellDeps[0].cellDep,
  };

  if (reset && fs.existsSync(STATE)) fs.rmSync(STATE);

  let st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;
  const useToken = st?.token || token;
  const useAmount = BigInt(st?.amount || amount);
  const rebuild = async (rgbppCellOutPoint) => {
    const cell = await client.getCellLive({
      txHash: rgbppCellOutPoint.txHash,
      index: Number(rgbppCellOutPoint.index),
    });
    if (!cell) throw new Error("RGB++ cell not live (already spent?)");
    const partial = await udt.issuanceCkbPartialTx({
      token: useToken, amount: useAmount, rgbppLiveCells: [cell], udtScriptInfo,
    });
    return partial;
  };

  // buildPsbt() rewrites RGB++ output lock args, replacing the pseudo index
  // (0xffffffff) with the real 1-based RGB++ output index. Phase 2 rebuilds the
  // tx from scratch, so it must apply the same rewrite before injecting the
  // BTC txid — otherwise the on-chain commitment (which uses the real index)
  // mismatches (error 66).
  const u32le = (n) => n.toString(16).padStart(8, "0").match(/../g).reverse().join("");
  const indexRgbppOutputs = (tx) => {
    const tpl = udt.rgbppLockScriptTemplate();
    let idx = 0;
    const clone = tx.clone();
    clone.outputs = tx.outputs.map((o) => {
      if (o.lock.codeHash === tpl.codeHash && o.lock.hashType === tpl.hashType) {
        idx++;
        return ccc.CellOutput.from({
          ...o,
          lock: { ...o.lock, args: o.lock.args.replace("ffffffff", u32le(idx)) },
        });
      }
      return o;
    });
    return clone;
  };

  // ---------- PHASE 1 ----------
  if (!st && (phase === "1" || phase === "all")) {
    const seal = { txId: sealTxId, index: sealIndex };
    const cell = await createRgbppCell(client, signer, udt, seal, cellCap);
    const partial = await udt.issuanceCkbPartialTx({
      token, amount, rgbppLiveCells: [cell], udtScriptInfo,
    });
    log("unique id (xUDT type args):", partial.outputs[0].type.args);
    const { psbt, indexedCkbPartialTx } = await btcWallet.buildPsbt({
      ckbPartialTx: partial,
      ckbClient: client,
      rgbppUdtClient: udt,
      btcChangeAddress: btcAddr,
      receiverBtcAddresses: [btcAddr],
      feeRate: Number(arg("btc-fee-rate", "3")),
    });
    log("indexed tx: in", indexedCkbPartialTx.inputs.length, "out", indexedCkbPartialTx.outputs.length);
    const btcTxId = await btcWallet.signAndBroadcast(psbt);
    log("BTC commitment tx broadcast:", btcTxId);
    st = {
      seal,
      rgbppCell: { txHash: cell.outPoint.txHash, index: Number(cell.outPoint.index) },
      btcTxId,
      token, amount: amount.toString(),
    };
    fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
    log("state saved ->", STATE);
    if (phase === "1") return;
  }
  if (!st) throw new Error("no state; run phase1 first");

  // ---------- PHASE 2 ----------
  if (phase === "2" || phase === "all" || phase === "diag") {
    log("btc tx:", st.btcTxId, "| rgbpp cell:", st.rgbppCell.txHash.slice(0, 16), "| seal:", st.seal.txId.slice(0, 16) + ":" + st.seal.index);
    const partial = await rebuild(st.rgbppCell);
    const injected = await udt.injectTxIdToRgbppCkbTx(indexRgbppOutputs(partial), st.btcTxId);
    const singer = new CkbRgbppUnlockSinger(
      client, btcAddr, btcWallet, btcWallet, udt.getRgbppScriptInfos(),
    );
    log("gathering SPV proof (waits for BTC confirmations)…");
    const signed = await singer.signTransaction(injected);
    log("--- before completeFeeBy ---");
    for (const [i, o] of signed.outputs.entries()) {
      log(`  out ${i} cap=${Number(o.capacity) / 1e8} type=${o.type ? o.type.codeHash.slice(0, 10) : null} args=${o.lock.args.slice(0, 20)}`);
    }
    log("  witnesses:", signed.witnesses.length);
    await signed.completeFeeBy(signer, 1000, undefined, { maxFeeRate: 100000 });
    log("--- after completeFeeBy ---");
    for (const [i, o] of signed.outputs.entries()) {
      log(`  out ${i} cap=${Number(o.capacity) / 1e8} type=${o.type ? o.type.codeHash.slice(0, 10) : null} args=${o.lock.args.slice(0, 20)}`);
    }
    if (phase === "diag") return;
    log("final tx: in", signed.inputs.length, "out", signed.outputs.length);
    for (const [i, inp] of signed.inputs.entries()) {
      const op = inp.previousOutput;
      log(`  in ${i} ${op.txHash.slice(0, 16)}:${op.index}`);
    }
    const finalTx = await signer.signTransaction(signed);
    const txHash = await signer.client.sendTransaction(finalTx);
    await client.waitTransaction(txHash);
    log("CKB issuance tx:", txHash);
    log("DONE — xUDT unique id:", signed.outputs[0].type.args);
    fs.renameSync(STATE, STATE.replace(".json", `.done.${Date.now()}.json`));
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("ISSUE_FAIL:", e.message || e);
  process.exit(1);
});
