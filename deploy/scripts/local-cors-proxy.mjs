// Local dev helper: forwards http://localhost:8080 to the GCP sandbox and adds CORS for http://localhost:3000.
// The sandbox edge (Caddy) sends no CORS headers, so a storefront running on localhost needs this to reach the APIs.
// Usage: node deploy/scripts/local-cors-proxy.mjs   (then run the storefront with NEXT_PUBLIC_API_BASE unset, i.e. http://localhost:8080)
// Change SANDBOX_HOST if the sandbox address changes. Holds no secrets.
import http from "node:http";
import https from "node:https";

const TARGET = process.env.SANDBOX_HOST || "34-47-166-37.sslip.io";
const ORIGIN = "http://localhost:3000";

http
  .createServer((req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Expose-Headers": "*",
      Vary: "Origin",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    const headers = { ...req.headers, host: TARGET };
    delete headers.origin;
    delete headers.referer;
    const up = https.request({ host: TARGET, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, { ...r.headers, ...cors });
      r.pipe(res);
    });
    up.on("error", (e) => {
      res.writeHead(502, cors);
      res.end(String(e));
    });
    res.on("close", () => up.destroy());
    req.pipe(up);
  })
  .listen(8080, () => console.log(`proxy on :8080 -> https://${TARGET}`));
