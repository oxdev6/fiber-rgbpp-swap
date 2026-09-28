// Leap sidecar (L1): narrow localhost API over the audited @ckb-ccc/rgbpp SDK.
// L1 scope: routing + validation + job tracking only. Real leap execution
// (commitment build, BTC broadcast, SPV polling) lands in L2.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const RGBPP_VERSION = (() => {
  try {
    // Read straight from disk (package exports map hides internals).
    const here = path.dirname(new URL(import.meta.url).pathname);
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(here, "..", "node_modules", "@ckb-ccc", "rgbpp", "package.json"),
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
      } catch (e) {
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
      const { buildNetworkConfig, PredefinedNetwork } = await import(
        "@ckb-ccc/rgbpp"
      );
      const chain =
        process.env.UTXO_BASED_CHAIN_NAME || PredefinedNetwork.BitcoinTestnet3;
      const cfg = buildNetworkConfig(chain);
      return send(res, 200, {
        chain: cfg.name,
        isMainnet: cfg.isMainnet,
        btcDustLimit: String(cfg.btcDustLimit),
        btcFeeRate: String(cfg.btcFeeRate),
        scripts: Object.keys(cfg.scripts || {}),
      });
    }

    if (req.method === "POST" && url.pathname === "/leap") {
      const p = await readBody(req);
      // Minimal validation; full script/UTXO validation happens in L2.
      if (!p || typeof p !== "object" || !p.btc_utxo || !p.to_ckb_script) {
        return send(res, 400, {
          error: "need { btc_utxo: {txid, vout}, to_ckb_script: {...} }",
        });
      }
      const id = `leap-${Date.now().toString(36)}-${++seq}`;
      const now = Date.now();
      jobs.set(id, { id, params: p, status: "queued", createdAt: now, updatedAt: now });
      return send(res, 202, { id, status: "queued" });
    }

    const m = url.pathname.match(/^\/leap\/([\w-]+)$/);
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]);
      if (!job) return send(res, 404, { error: "unknown job" });
      return send(res, 200, job);
    }

    return send(res, 404, { error: "unknown route" });
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) });
  }
});

const PORT = Number(process.env.LEAP_PORT || 8399);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`leap-sidecar listening on 127.0.0.1:${PORT} (rgbpp ${RGBPP_VERSION})`);
});
