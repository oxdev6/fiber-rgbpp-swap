// Plain xUDT transfer — move part of the RGB++-issued asset to a Fiber node wallet.
//
// The RGB++ lineage asset (unique id 0xd045213e…, code 0x25c29dc3…) sits on the
// sidecar address after issue -> leap -> unlock. Fiber only carries plain UDT,
// so to swap THE RGB++ asset we first move units into node B's wallet.
//
// Usage: node src/transfer-udt.js [--to ADDR] [--amount UNITS] [--cap-to CKB] [--dry]
import fs from "node:fs";
import path from "node:path";
import * as ccc from "@ckb-ccc/core";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const UDT = {
  codeHash: "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
  hashType: "type",
  args: "0xd045213e601bcf592cac347c69f65caf3a0fe0201e5b33dad03f06b62700fceb",
};
const XUDT_DEP = {
  outPoint: {
    txHash: "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
    index: "0x0",
  },
  depType: "code",
};
const INPUT_ARG = arg("input", null);
const ASSET_ARG = arg("asset", null);
let UDT_A = { ...UDT, args: ASSET_ARG || UDT.args };

const TO = arg("to", "ckt1qyqf6vpwj39mh4vzwvhjeu4rrscn8fppeg0svt70ms");
const AMOUNT = BigInt(arg("amount", "100000")) * 100000000n;
const CAP_TO = BigInt(arg("cap-to", "210")) * 100000000n;
const dry = process.argv.includes("--dry");

const enc = (n) =>
  "0x" +
  BigInt(n).toString(16).padStart(32, "0").match(/../g).reverse().join("");
const dec = (hex) => {
  const bytes = (hex.replace(/^0x/, "").match(/../g) || []).reverse();
  return BigInt("0x" + (bytes.join("") || "0"));
};

const main = async () => {
  const client = new ccc.ClientPublicTestnet();
  const signer = new ccc.SignerCkbPrivateKey(
    client,
    fs.readFileSync(path.join(HERE, "..", ".ckb-key"), "utf8").trim(),
  );
  const fromAddr = (await signer.getRecommendedAddressObj()).toString();
  const fromLock = (await signer.getRecommendedAddressObj()).script;
  const toLock = (await ccc.Address.fromString(TO, client)).script;
  console.log("• from:", fromAddr);
  console.log("• to  :", TO);

  let INPUT;
  if (INPUT_ARG) {
    INPUT = { txHash: INPUT_ARG.split(":")[0], index: "0x" + Number(INPUT_ARG.split(":")[1]).toString(16) };
  } else {
    let best = null;
    for await (const c of client.findCellsByLock(fromLock)) {
      const o = c.cellOutput ?? c.output;
      if (!o?.type || o.type.codeHash !== UDT.codeHash) continue;
      if (ASSET_ARG && o.type.args !== ASSET_ARG) continue;
      if (!best || BigInt(c.outputData) > BigInt(best.outputData)) best = c;
    }
    if (!best) throw new Error("no xUDT cell found at address");
    INPUT = best.outPoint;
    UDT_A = { codeHash: best.cellOutput.type.codeHash, hashType: best.cellOutput.type.hashType, args: best.cellOutput.type.args };
    console.log("• discovered asset", UDT_A.args.slice(0, 18), "at", INPUT.txHash.slice(0, 18) + ":" + INPUT.index);
  }

  const cell = await client.getCell(INPUT);
  if (!cell) throw new Error("input cell not live: " + JSON.stringify(INPUT));
  const cellOut = cell.cellOutput ?? cell.output;
  const total = dec(cell.outputData);
  const capIn = BigInt(cellOut.capacity);
  console.log("• input capacity:", Number(capIn) / 1e8, "CKB");
  console.log("• input udt     :", total.toString(), "raw");
  if (AMOUNT > total) throw new Error("amount exceeds cell balance");
  const FEE = 1000000n;
  const rest = total - AMOUNT;
  const outputs = [{ lock: toLock, type: UDT_A, capacity: CAP_TO }];
  const outputsData = [enc(AMOUNT)];
  // An xUDT cell needs ~142 CKB occupied, so a UDT change cell is only possible
  // when the remainder is that large; otherwise return plain CKB capacity.
  if (rest > 0n && capIn - CAP_TO - FEE >= 14300000000n) {
    outputs.push({ lock: fromLock, type: UDT_A, capacity: capIn - CAP_TO - FEE });
    outputsData.push(enc(rest));
  } else {
    outputs.push({ lock: fromLock, capacity: capIn - CAP_TO - FEE });
    outputsData.push("0x");
  }
  console.log("• out:", AMOUNT.toString(), "raw -> to |", rest.toString(), "raw change");
  console.log("• caps:", Number(CAP_TO) / 1e8, "to |", Number(capIn - CAP_TO - FEE) / 1e8, "change | fee", Number(FEE) / 1e8, "CKB");

  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: INPUT }],
    outputs,
    outputsData,
  });
  tx.addCellDeps(XUDT_DEP);
  if (dry) {
    console.log("• DRY — summary:");
    console.log(JSON.stringify({
      inputs: tx.inputs.map((i) => `${i.previousOutput.txHash}:${i.previousOutput.index}`),
      cellDeps: tx.cellDeps.map((d) => `${d.outPoint.txHash}:${d.outPoint.index} (${d.depType})`),
      outputs: tx.outputs.map((o, i) => ({
        capacity: (BigInt(o.capacity) / 100000000n).toString() + " CKB",
        type: o.type ? `${o.type.codeHash.slice(0, 12)}/${o.type.args.slice(0, 14)}` : null,
        data: tx.outputsData[i],
      })),
    }, null, 2));
    return;
  }
  const signed = await signer.signTransaction(tx);
  const hash = await signer.client.sendTransaction(signed);
  console.log("• SENT tx:", hash);
};

main().then(() => process.exit(0)).catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
