// Docker-free stand-in for the Caddy edge: node deploy/scripts/dev-gateway.mjs
// :8080 -> /api/<service>/* (prefix stripped, streaming-safe for SSE) and everything else to the storefront on :3000.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT || 8080);
const ORIGIN = process.env.CORS_ALLOW_ORIGIN || "http://localhost:3000";
const routes = {
  "/api/identity/": 8081,
  "/api/catalog/": 8082,
  "/api/orders/": 8083,
  "/api/payments/": 8084,
  "/api/fleet/": 8085,
};
const STOREFRONT = 3000;

function target(url) {
  for (const [prefix, port] of Object.entries(routes)) {
    if (url.startsWith(prefix)) return { port, path: "/" + url.slice(prefix.length) };
  }
  if (url === "/webhooks/razorpay") return { port: 8084, path: url };
  return { port: STOREFRONT, path: url };
}

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
        Vary: "Origin",
      });
      res.end();
      return;
    }
    const t = target(req.url || "/");
    const upstream = http.request(
      { host: "127.0.0.1", port: t.port, path: t.path, method: req.method, headers: req.headers },
      (up) => {
        const headers = { ...up.headers, "Access-Control-Allow-Origin": ORIGIN, Vary: "Origin" };
        res.writeHead(up.statusCode || 502, headers);
        up.pipe(res);
        res.on("close", () => up.destroy());
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Upstream unavailable");
    });
    req.pipe(upstream);
    res.on("close", () => upstream.destroy());
  })
  .listen(PORT, "127.0.0.1", () => console.log(`dev gateway on http://localhost:${PORT}`));
