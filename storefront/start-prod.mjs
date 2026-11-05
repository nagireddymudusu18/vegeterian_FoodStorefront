import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storefrontDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(storefrontDir, "..");

function resolveNextBin() {
  const candidates = [
    path.join(storefrontDir, "node_modules", "next", "dist", "bin", "next"),
    path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const buildIdPath = path.join(storefrontDir, ".next", "BUILD_ID");
const nextBin = resolveNextBin();

if (!fs.existsSync(buildIdPath)) {
  console.log("[start-prod] Production build not found at .next/BUILD_ID, building now...");
  const buildResult = nextBin
    ? spawnSync(process.execPath, [nextBin, "build"], {
        cwd: storefrontDir,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "production" },
      })
    : spawnSync("npx", ["next", "build"], {
        cwd: storefrontDir,
        stdio: "inherit",
        shell: true,
        env: { ...process.env, NODE_ENV: "production" },
      });

  if (buildResult.status !== 0) {
    console.error("[start-prod] Failed to build Next.js application.");
    process.exit(buildResult.status ?? 1);
  }
}

const PRIMARY_PORT = 3000;
const envPort = process.env.PORT ? Number(process.env.PORT) : PRIMARY_PORT;

// If Cloud Run sets PORT to something other than 3000 (e.g. 8080) and no proxy is already bound there,
// bridge 0.0.0.0:$PORT -> 127.0.0.1:3000 so both $PORT and 3000 respond seamlessly.
if (Number.isFinite(envPort) && envPort > 0 && envPort !== PRIMARY_PORT) {
  const proxy = net.createServer((clientSocket) => {
    const upstream = net.connect(PRIMARY_PORT, "127.0.0.1");
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
    clientSocket.on("error", () => upstream.destroy());
    upstream.on("error", () => clientSocket.destroy());
  });

  proxy.on("error", (err) => {
    if (err && err.code !== "EADDRINUSE") {
      console.warn(`[start-prod] Optional port bridge on ${envPort} warning:`, err.message);
    }
  });

  proxy.listen(envPort, "0.0.0.0", () => {
    console.log(`[start-prod] Bridging 0.0.0.0:${envPort} -> 127.0.0.1:${PRIMARY_PORT}`);
  });
}

const child = nextBin
  ? spawn(process.execPath, [nextBin, "start", "-p", String(PRIMARY_PORT), "-H", "0.0.0.0"], {
      cwd: storefrontDir,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", PORT: String(PRIMARY_PORT) },
    })
  : spawn("npx", ["next", "start", "-p", String(PRIMARY_PORT), "-H", "0.0.0.0"], {
      cwd: storefrontDir,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NODE_ENV: "production", PORT: String(PRIMARY_PORT) },
    });

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
