import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storefrontDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(storefrontDir, "..");
const isVercel = Boolean(process.env.VERCEL);

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

const nextBin = resolveNextBin();
console.log(
  `[build-prod] Running Next.js production build in storefront (${isVercel ? "Vercel" : "Standalone/Cloud Run"} mode)...`
);

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
  console.error("[build-prod] Next.js build failed.");
  process.exit(buildResult.status ?? 1);
}

const srcNextDir = path.join(storefrontDir, ".next");
const srcStandaloneDir = path.join(srcNextDir, "standalone");
const srcStandaloneStorefrontDir = path.join(srcStandaloneDir, "storefront");
const srcStaticDir = path.join(srcNextDir, "static");
const srcPublicDir = path.join(storefrontDir, "public");

const rootNextDir = path.join(rootDir, ".next");
const rootStandaloneDir = path.join(rootNextDir, "standalone");
const rootStaticDir = path.join(rootNextDir, "static");
const rootPublicDir = path.join(rootDir, "public");

// Sync public assets to root /public for both Vercel and Cloud Run
if (fs.existsSync(srcPublicDir)) {
  fs.mkdirSync(rootPublicDir, { recursive: true });
  fs.cpSync(srcPublicDir, rootPublicDir, { recursive: true, force: true });
}

if (isVercel) {
  console.log("[build-prod] Preparing root /.next output for Vercel deployment...");
  fs.rmSync(rootNextDir, { recursive: true, force: true });
  fs.mkdirSync(rootNextDir, { recursive: true });

  for (const entry of fs.readdirSync(srcNextDir)) {
    if (entry === "cache") continue;
    fs.cpSync(path.join(srcNextDir, entry), path.join(rootNextDir, entry), {
      recursive: true,
      force: true,
      dereference: false,
    });
  }

  const rootReqServerFiles = path.join(rootNextDir, "required-server-files.json");
  if (fs.existsSync(rootReqServerFiles)) {
    try {
      const reqData = JSON.parse(fs.readFileSync(rootReqServerFiles, "utf8"));
      reqData.appDir = rootDir;
      reqData.relativeAppDir = "";
      fs.writeFileSync(rootReqServerFiles, JSON.stringify(reqData));
    } catch (err) {
      console.warn("[build-prod] Could not normalize Vercel required-server-files.json:", err);
    }
  }

  console.log("[build-prod] Vercel build output ready at both /.next and /storefront/.next.");
} else {
  console.log("[build-prod] Assembling root /.next/standalone and /.next/static artifacts...");

  fs.rmSync(rootStandaloneDir, { recursive: true, force: true });
  fs.rmSync(rootStaticDir, { recursive: true, force: true });
  fs.mkdirSync(rootStandaloneDir, { recursive: true });

  // 1. Copy traced node_modules into /.next/standalone/node_modules
  const srcStandaloneNodeModules = path.join(srcStandaloneDir, "node_modules");
  if (fs.existsSync(srcStandaloneNodeModules)) {
    fs.cpSync(srcStandaloneNodeModules, path.join(rootStandaloneDir, "node_modules"), {
      recursive: true,
      dereference: false,
    });
  }

  // 2. Copy workspace app files (server.js, .next) from standalone/storefront to root /.next/standalone
  // Skip package.json inside .next/standalone because the standalone archiver writes root package.json (with "start": "node server.js").
  if (fs.existsSync(srcStandaloneStorefrontDir)) {
    for (const entry of fs.readdirSync(srcStandaloneStorefrontDir)) {
      if (entry === "package.json") continue;
      const fromPath = path.join(srcStandaloneStorefrontDir, entry);
      const toPath = path.join(rootStandaloneDir, entry);
      fs.cpSync(fromPath, toPath, {
        recursive: true,
        force: true,
        dereference: false,
      });
    }
  } else if (fs.existsSync(srcStandaloneDir)) {
    fs.cpSync(srcStandaloneDir, rootStandaloneDir, {
      recursive: true,
      force: true,
      dereference: false,
    });
    fs.rmSync(path.join(rootStandaloneDir, "package.json"), { force: true });
  }

  // Normalize required-server-files.json relativeAppDir so root server.js resolves paths cleanly
  const reqServerFilesPath = path.join(rootStandaloneDir, ".next", "required-server-files.json");
  if (fs.existsSync(reqServerFilesPath)) {
    try {
      const reqData = JSON.parse(fs.readFileSync(reqServerFilesPath, "utf8"));
      reqData.relativeAppDir = "";
      fs.writeFileSync(reqServerFilesPath, JSON.stringify(reqData));
    } catch (err) {
      console.warn("[build-prod] Could not update required-server-files.json:", err);
    }
  }

  // Enhance standalone server.js so it serves on process.env.PORT (or 3000) and bridges 3000 <-> PORT if they differ
  const standaloneServerPath = path.join(rootStandaloneDir, "server.js");
  if (fs.existsSync(standaloneServerPath)) {
    const originalServerJs = fs.readFileSync(standaloneServerPath, "utf8");
    const portBridgeSnippet = `
const net = require('net');
const envPort = parseInt(process.env.PORT, 10);
if (Number.isFinite(envPort) && envPort > 0 && envPort !== 3000) {
  const bridge = net.createServer((client) => {
    const upstream = net.connect(envPort, '127.0.0.1');
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  bridge.on('error', () => {});
  bridge.listen(3000, '0.0.0.0');
}
`;
    fs.writeFileSync(standaloneServerPath, originalServerJs + "\n" + portBridgeSnippet);
  }

  // 3. Copy static assets to /.next/static (archived by standalone packager into /.next/static)
  if (fs.existsSync(srcStaticDir)) {
    fs.cpSync(srcStaticDir, rootStaticDir, { recursive: true, force: true });
  }

  // 4. Copy top-level build manifests to /.next
  for (const entry of fs.readdirSync(srcNextDir)) {
    if (entry === "standalone" || entry === "static" || entry === "cache" || entry === "server") {
      continue;
    }
    fs.cpSync(path.join(srcNextDir, entry), path.join(rootNextDir, entry), {
      recursive: true,
      force: true,
    });
  }

  // 5. Remove duplicate storefront/.next/standalone copy to keep workspace size minimal
  fs.rmSync(srcStandaloneDir, { recursive: true, force: true });

  console.log("[build-prod] Standalone build artifacts ready at /.next/standalone and /.next/static.");
}
