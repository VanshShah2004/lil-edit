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
// directory handles both layouts, and any nesting depth, without special-casing dist.
function findEnvFile(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const envPath = findEnvFile();
// No file found: fall back to dotenv's default (cwd/.env). Real deployments may also
// inject env vars directly (pm2 ecosystem, systemd, container env), so a missing file
// is not fatal here — the consuming module decides whether its own vars are required.
dotenv.config(envPath ? { path: envPath } : {});
