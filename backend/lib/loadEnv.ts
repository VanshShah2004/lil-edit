import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Side-effecting module: importing it populates process.env from backend/.env.
//
// Every module that reads process.env at import time must import THIS rather than
// calling dotenv.config() itself with a hardcoded "..". ES module imports are fully
// evaluated before the importing module's body runs, so whichever module in the graph
// resolves .env first is the one that counts — server.ts's own call is too late to
// help a lib/ module that throws on missing config.
//
// Hardcoding "../.env" also breaks the moment the code is compiled: lib/supabase.ts
// sits at backend/lib/ in source but backend/dist/lib/ in the build, so ".." lands on
// backend/dist/.env instead of backend/.env. Walking up from this module's own
// directory handles both layouts, and any nesting depth.

// tsconfig outDir. A .env inside the build output is NEVER the intended config: dist/
// is gitignored and tsc never prunes it, so a stray copy there outlives every rebuild
// and — because the walk below stops at the FIRST match — silently shadows the real
// backend/.env forever. Edits to the real file then do nothing, with no error to
// explain why. That cost a production outage once (Razorpay keys read as empty from a
// months-old dist/.env), so the walk now refuses to look inside the build directory
// at all rather than trusting it to be absent.
const BUILD_DIR = "dist";

function findEnvFile(): string | undefined {
  // Ancestor chain from this module's own directory up to the filesystem root.
  const chain: string[] = [];
  for (let dir = path.dirname(fileURLToPath(import.meta.url)); ; ) {
    chain.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Start the search just ABOVE the nearest enclosing build directory, so every
  // candidate inside it is skipped. Nearest (not outermost) on purpose: a project
  // that happens to live under an unrelated path segment named "dist" must still
  // find its own .env.
  let start = 0;
  for (let i = 0; i < chain.length; i++) {
    if (path.basename(chain[i]!) === BUILD_DIR) {
      start = i + 1;
      // Loud about it: a .env sitting in dist/ is a mistake worth fixing, and a
      // silent skip would just trade one invisible behaviour for another.
      const shadow = path.join(chain[i]!, ".env");
      if (fs.existsSync(shadow)) {
        console.warn(
          `[loadEnv] IGNORING ${shadow} — a .env inside the build directory shadows the real one. Delete it.`,
        );
      }
      break;
    }
  }

  for (let i = start; i < chain.length; i++) {
    const candidate = path.join(chain[i]!, ".env");
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

const envPath = findEnvFile();
// No file found: fall back to dotenv's default (cwd/.env). Real deployments may also
// inject env vars directly (pm2 ecosystem, systemd, container env), so a missing file
// is not fatal here — the consuming module decides whether its own vars are required.
dotenv.config(envPath ? { path: envPath } : {});
console.log(`[loadEnv] loaded ${envPath ?? "(dotenv default: cwd/.env)"}`);
