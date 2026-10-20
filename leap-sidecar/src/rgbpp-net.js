// TESTNET3 CELL-DEP FIXUP
// ---------------------------------------------------------------------------
// The @ckb-ccc/rgbpp canary still points testnet3 at the ORIGINAL deployment
// cells, which were later swept:
//   RgbppLock  : 0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00:0  (DEAD)
//   BtcTimeLock: 0xde0f87878a97500f549418e5d46d2f7704c565a262aa17036c9c1c13ad638529:0  (DEAD)
// The scripts themselves did NOT change (same codeHash); the deployment moved
// to new live cells. The canonical RGBPlusPlus/rgbpp-sdk (v0.7.3) points at:
//   RgbppLock  : 0x0d1567da0979f78b297d5311442669fbd1bd853c8be324c5ab6da41e7a1ed6e5:0  (live)
//   BtcTimeLock: 0x8fb747ff0416a43e135c583b028f98c7b81d3770551b196eb7ba1062dd9acc94:0  (live)
// The signer derives each config dep as (same txHash, index 0x1), so overriding
// only the code deps is sufficient.
import * as ccc from "@ckb-ccc/core";
import {
  buildNetworkConfig,
  PredefinedNetwork,
  PredefinedScriptName,
} from "@ckb-ccc/rgbpp";

export const TESTNET3_CELLDEPS = {
  [PredefinedScriptName.RgbppLock]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0x0d1567da0979f78b297d5311442669fbd1bd853c8be324c5ab6da41e7a1ed6e5",
      index: "0x0",
    },
    depType: "code",
  }),
  [PredefinedScriptName.BtcTimeLock]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0x8fb747ff0416a43e135c583b028f98c7b81d3770551b196eb7ba1062dd9acc94",
      index: "0x0",
    },
    depType: "code",
  }),
};

// Build a network config with the live testnet3 cell deps applied.
export function buildConfig(network, overrides = {}) {
  const isTestnet3 = network === PredefinedNetwork.BitcoinTestnet3;
  const cellDeps = isTestnet3
    ? { ...TESTNET3_CELLDEPS, ...(overrides.cellDeps || {}) }
    : overrides.cellDeps;
  return buildNetworkConfig(network, { ...overrides, ...(cellDeps ? { cellDeps } : {}) });
}

export { PredefinedNetwork };
