// TESTNET3 RGB++ xUDT LEAP (CKB -> BTC).
//
// Spends an RGBPP-locked xUDT cell and re-locks it under the BTC-Time lock,
// bound to a fresh BTC transaction that also spends the RGB++ "seal" UTXO(s).
// This is the isomorphic-binding "leap": the asset leaves the RGBPP lock and
// can only be unlocked after the leap BTC tx has N confirmations.
//
// Capacity notes:
//   buildPsbt() parses EVERY ckbPartialTx input as an RGBPP cell (seal args),
//   so plain capacity inputs are rejected. The xUDT cell (min capacity ~158 CKB)
//   is too small to cover the BTC-Time-locked output (~247 CKB), so a second,
//   typed-less RGBPP capacity cell is merged in. Both inputs are RGBPP cells,
//   each bound to its own (confirmed) BTC seal, so the leap BTC tx spends both.
//
// Phases:
//   setup  : create the fat RGBPP capacity cell bound to a spare BTC UTXO.
//   phase1 : build the leap CKB tx -> build+broadcast the leap BTC tx -> save.
//   phase2 : rebuild, inject the BTC txid, SPV-prove the seal spends, broadcast.
//
// Usage:
//   node src/testnet3-leap.js [setup|phase1|phase2|all|diag] [--units N] [--dry]
import fs from "node:fs";
import path from "node:path";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import * as ccc from "@ckb-ccc/core";
import { ccc as sccc } from "@ckb-ccc/shell";
import {
  PredefinedNetwork,
  PrivateKeyRgbppBtcWallet,
  RgbppUdtClient,
  CkbRgbppUnlockSinger,
  parseBtcTimeLockArgs,
} from "@ckb-ccc/rgbpp";
import { buildConfig } from "./rgbpp-net.js";

const bip32Lib = BIP32Factory(ecc);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const STATE = path.join(HERE, "..", "..", "localnet", "testnet3-leap.json");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const rawPhase = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "all";
const phase = rawPhase.replace(/^phase/, "");
const UNIQUE_ID = arg("uid", "0xd045213e601bcf592cac347c69f65caf3a0fe0201e5b33dad03f06b62700fceb");
const CELL_ARG = arg("cell", "0x4995160e4007cd739138d140c18241a46fc74c729b6ddb2a7581aa8dc5f97432:0");
const FAT_SEAL = { txId: arg("fat-seal-tx", "0xb5d882c9878f09b70e74b654054bb8b565f075ef5c7c2b8f78397c07ed2e08b3"), index: Number(arg("fat-seal-idx", "2")) };
const FAT_CAP = BigInt(arg("fat-cap", "500")) * 100000000n;
const AFTER = 6; // must be >= MIN_BTC_TIME_LOCK_AFTER
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
const beHexToBig = (data) => BigInt("0x" + Buffer.from(data.slice(2), "hex").reverse().toString("hex") || "0");

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
  const ckbAddr = (await signer.getRecommendedAddressObj()).toString();
  log("ckb:", ckbAddr, "\n• btc:", btcAddr);

  const udtScriptInfo = {
    name: ccc.KnownScript.XUdt,
    script: await ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, ""),
    cellDep: (await client.getKnownScript(ccc.KnownScript.XUdt)).cellDeps[0].cellDep,
  };
  const xudtScript = ccc.Script.from({ ...udtScriptInfo.script, args: UNIQUE_ID });
  const xudt = new sccc.udt.Udt(udtScriptInfo.cellDep.outPoint, xudtScript);

  const cellOutPoint = { txHash: CELL_ARG.split(":")[0], index: Number(CELL_ARG.split(":")[1]) };

  if (reset && fs.existsSync(STATE)) fs.rmSync(STATE);
  let st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null;

  // ---------- SETUP: fat RGBPP capacity cell ----------
  if (!st && (phase === "setup" || phase === "all")) {
    const lock = udt.buildRgbppLockScript(FAT_SEAL);
    let fatCell = null;
    for await (const cell of client.findCellsByLock(lock)) {
      if (BigInt(cell.cellOutput.capacity) >= FAT_CAP) { fatCell = cell; break; }
    }
    if (fatCell) {
      log("reusing fat RGBPP cell", fatCell.outPoint.txHash.slice(0, 18));
    } else {
      log("creating fat RGBPP cell, cap", Number(FAT_CAP) / 1e8, "CKB, seal", FAT_SEAL.txId.slice(0, 16) + ":" + FAT_SEAL.index);
      const tx = ccc.Transaction.default();
      tx.addOutput({ lock, capacity: FAT_CAP });
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000, undefined, { maxFeeRate: 100000 });
      const h = await signer.client.sendTransaction(await signer.signTransaction(tx));
      await client.waitTransaction(h);
      fatCell = { outPoint: { txHash: h, index: 0 } };
      log("fat RGBPP cell tx", h);
    }
    st = { fatCell: { txHash: fatCell.outPoint.txHash, index: Number(fatCell.outPoint.index) } };
    fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
    if (phase === "setup") return;
  }
  if (!st) throw new Error("run `setup` first");
  if (!st.fatCell) throw new Error("state missing fatCell");

  const fatOutPoint = { txHash: st.fatCell.txHash, index: Number(st.fatCell.index) };

  // ---- shared: deterministic rebuild of the leap CKB partial tx ----
  // Inputs are fixed ([xUDT cell, fat capacity cell]) and NEVER auto-completed:
  // the RGBPP lock commits the input set into the BTC tx, so the same inputs
  // must be used by the run that builds the commitment and the run that sends.
  const rebuild = async () => {
    const cell = await client.getCellLive(cellOutPoint);
    if (!cell) throw new Error("RGB++ xUDT cell not live (already spent?)");
    const inBal = beHexToBig(cell.outputData);
    const leapBal = BigInt(arg("units", inBal.toString()));
    if (leapBal > inBal) throw new Error(`cell holds ${inBal}, need ${leapBal}`);
    const btcTimeLock = await udt.buildBtcTimeLockScript(ckbAddr, AFTER);
    const { res } = await xudt.transfer(signer, [{ to: btcTimeLock, amount: leapBal }]);
    const tx = ccc.Transaction.from(res);
    tx.addInput({ previousOutput: fatOutPoint });
    tx.addInput({ previousOutput: cellOutPoint });
    const inputs = tx.inputs.map((i) => i.previousOutput);
    for (const o of tx.outputs) {
      if (o.lock.codeHash.toLowerCase() === cfg.scripts.BtcTimeLock.codeHash.toLowerCase()) {
        const p = parseBtcTimeLockArgs(o.lock.args);
        if (Number(p.confirmations) < AFTER) throw new Error(`ASSERT FAIL: after=${p.confirmations}<${AFTER}`);
        log(`assert ok: btc-time-lock after=${p.confirmations}`);
      }
    }
    return { tx, leapBal, inBal, inputs };
  };

  // ---------- PHASE 1 ----------
  if (!st.btcTxId && (phase === "1" || phase === "all")) {
    const { tx, leapBal, inBal } = await rebuild();
    log(`leaping ${leapBal} of ${inBal} (base units) from ${CELL_ARG.slice(0, 18)}`);
    const { psbt, indexedCkbPartialTx } = await btcWallet.buildPsbt({
      ckbPartialTx: tx,
      ckbClient: client,
      rgbppUdtClient: udt,
      btcChangeAddress: btcAddr,
      receiverBtcAddresses: [],
      feeRate: Number(arg("btc-fee-rate", "3")),
    });
    log("indexed tx: in", indexedCkbPartialTx.inputs.length, "out", indexedCkbPartialTx.outputs.length);
    for (const [i, o] of indexedCkbPartialTx.outputs.entries()) {
      log(`  out ${i} cap=${Number(o.capacity) / 1e8} type=${o.type ? o.type.codeHash.slice(0, 10) : null} lockargs=${o.lock.args.slice(0, 18)}`);
    }
    if (process.argv.includes("--dry")) { log("dry run ok (BTC tx NOT broadcast)"); return; }
    const btcTxId = await btcWallet.signAndBroadcast(psbt);
    log("BTC leap tx broadcast:", btcTxId, "-> wait for confirm, then run phase2");
    st = { ...st, cell: cellOutPoint, uniqueId: UNIQUE_ID, btcTxId, units: leapBal.toString() };
    fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
    log("state saved ->", STATE);
    if (phase === "1") return;
  }
  if (!st.btcTxId) throw new Error("no btcTxId in state; run phase1 first");

  // ---------- PHASE 2 ----------
  if (phase === "2" || phase === "all" || phase === "diag") {
    log("btc leap tx:", st.btcTxId, "| cell:", st.cell.txHash.slice(0, 18), "| units:", st.units);
    const { tx } = await rebuild();
    const { indexedCkbPartialTx } = await btcWallet.buildPsbt({
      ckbPartialTx: tx,
      ckbClient: client,
      rgbppUdtClient: udt,
      btcChangeAddress: btcAddr,
      receiverBtcAddresses: [],
      feeRate: Number(arg("btc-fee-rate", "3")),
    });
    const injected = await udt.injectTxIdToRgbppCkbTx(indexedCkbPartialTx, st.btcTxId);
    const singer = new CkbRgbppUnlockSinger(client, btcAddr, btcWallet, btcWallet, udt.getRgbppScriptInfos());
    log("gathering SPV proof of seal spends (waits for BTC confirmations)…");
    // singer.signTransaction == prepareTransaction + signOnlyTransaction, and the
    // latter is what inserts the RGBPP unlock witness (btc tx + SPV proof).
    const prepared = await singer.signTransaction(injected);
    // The SDK inserts WitnessArgs with inputType/outputType = "" which serializes to
    // Some(0x) -- an *empty* XudtWitness. When the xUDT is on an input the script parses
    // that field as a molecule and fails MOL_ERR_DATA (7). Replace with a valid empty
    // XudtWitness { owner_script: None, extension_scripts: None } = 0x080000000800000008000000.
    const EMPTY_XUDT_WITNESS = "0x080000000800000008000000";
    prepared.witnesses.forEach((w, i) => {
      const wa = ccc.WitnessArgs.fromBytes(w);
      prepared.setWitnessAt(i, ccc.WitnessArgs.from({
        lock: wa.lock ?? "0x",
        inputType: EMPTY_XUDT_WITNESS,
        outputType: EMPTY_XUDT_WITNESS,
      }).toBytes());
    });
    log("witnesses:", prepared.witnesses.length);
    prepared.witnesses.forEach((w, i) => {
      try {
        const wa = ccc.WitnessArgs.fromBytes(w);
        log(`  w[${i}] len=${w.length} lock=${wa.lock ? wa.lock.length : "none"} inputType=${wa.inputType ? wa.inputType.length : "none"} outputType=${wa.outputType ? wa.outputType.length : "none"}`);
      } catch (e) { log(`  w[${i}] len=${w.length} (parse err ${e.message})`); }
    });
    prepared.outputs.forEach((o, i) => {
      const d = prepared.outputsData[i] || "0x";
      log(`  outdata[${i}] len=${(d.length - 2) / 2} ${d.slice(0, 40)}`);
    });
    log("--- before completeFeeBy ---");
    for (const [i, o] of prepared.outputs.entries()) {
      log(`  out ${i} cap=${Number(o.capacity) / 1e8} type=${o.type ? o.type.codeHash.slice(0, 10) : null} lockargs=${o.lock.args.slice(0, 18)}`);
    }
    await prepared.completeFeeBy(signer, 1500, undefined, { maxFeeRate: 100000, shouldAddInputs: false });
    log("--- after completeFeeBy ---");
    for (const [i, o] of prepared.outputs.entries()) {
      log(`  out ${i} cap=${Number(o.capacity) / 1e8} type=${o.type ? o.type.codeHash.slice(0, 10) : null} lockargs=${o.lock.args.slice(0, 18)}`);
    }
    if (phase === "diag") return;
    log("final tx: in", prepared.inputs.length, "out", prepared.outputs.length);
    for (const [i, inp] of prepared.inputs.entries()) {
      log(`  in ${i} ${inp.previousOutput.txHash.slice(0, 18)}:${inp.previousOutput.index}`);
    }
    const finalTx = await signer.signTransaction(prepared);
    const txHash = await signer.client.sendTransaction(finalTx);
    await client.waitTransaction(txHash);
    log("CKB leap tx:", txHash);
    log("DONE — asset re-locked under BTC-Time lock");
    fs.renameSync(STATE, STATE.replace(".json", `.done.${Date.now()}.json`));
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("LEAP_FAIL:", e.message || e);
  console.error(e && e.stack ? e.stack : "");
  process.exit(1);
});
