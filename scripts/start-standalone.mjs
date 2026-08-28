/**
 * Start the Next.js standalone server after copying static assets.
 * Use after `npm run build` for production-style local runs (no Docker).
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const serverEntry = path.join(standaloneDir, "server.js");

if (!existsSync(serverEntry)) {
  console.error("start-standalone: run `npm run build` first (.next/standalone missing)");
  process.exit(1);
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneDir, "public");

cpSync(staticSrc, staticDest, { recursive: true });
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

const port = process.env.PORT ?? "3000";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const child = spawn("node", ["server.js"], {
  cwd: standaloneDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    HOSTNAME: hostname,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
