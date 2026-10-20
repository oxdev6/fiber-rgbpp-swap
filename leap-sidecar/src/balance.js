// Print the sidecar's CKB + RGB++ xUDT balances.
// Usage: node src/balance.js
import fs from "node:fs";
import path from "node:path";
import * as ccc from "@ckb-ccc/core";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const XUDT_CODE = "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb";
const ASSET = "0xd045213e601bcf592cac347c69f65caf3a0fe0201e5b33dad03f06b62700fceb";

const client = new ccc.ClientPublicTestnet();
const signer = new ccc.SignerCkbPrivateKey(
  client,
  fs.readFileSync(path.join(HERE, "..", ".ckb-key"), "utf8").trim(),
);
const addr = await signer.getRecommendedAddressObj();
console.log("address:", addr.toString());

let ckb = 0n, cells = 0, assetUnits = 0n, assetCells = 0;
for await (const c of client.findCellsByLock(addr.script)) {
  cells++;
  ckb += c.cellOutput.capacity;
  const t = c.cellOutput.type;
  if (t && t.codeHash === XUDT_CODE && t.args === ASSET) {
    assetUnits += BigInt(c.outputData);
    assetCells++;
  }
}
console.log("CKB :", Number(ckb) / 1e8, "CKB in", cells, "cells");
console.log("xUDT:", assetUnits.toString(), "raw (", Number(assetUnits) / 1e8, "units ) in", assetCells, "cell(s)");
