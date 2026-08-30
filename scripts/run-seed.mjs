/**
 * Runs `src/lib/db/seed.ts` via the local `tsx` binary.
 * Compose hides the host `node_modules` behind a named volume; if that volume
 * is empty or `npm ci` has not finished, `tsx` is missing. Say so clearly.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedFile = path.join(root, "src/lib/db/seed.ts");
const require = createRequire(import.meta.url);

let tsxCli;
try {
  tsxCli = require.resolve("tsx/cli");
} catch {
  console.error(`tsx is not installed in this environment (node_modules/.bin/tsx).

If you are in Docker Compose:
  1. Wait until \`docker compose logs app\` shows Next.js Ready (that means npm ci finished).
  2. docker compose exec app npm ci
  3. docker compose exec app npm run db:seed

If it still fails, recreate the app node_modules volume:
  docker compose down
  docker volume rm open-tc-manager_app_node_modules
  docker compose up
`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, seedFile], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(result.status ?? 1);
