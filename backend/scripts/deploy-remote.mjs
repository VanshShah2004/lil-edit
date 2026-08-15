#!/usr/bin/env node
/**
 * Trigger the EC2 deploy from a developer machine.
 *
 *   npm run deploy:remote
 *
 * A thin wrapper: it SSHes in and runs `npm run deploy` (scripts/deploy.sh) on the
 * box, which is where the real logic lives and is version-controlled. Written in
 * Node rather than shell so it behaves identically from PowerShell, cmd and bash —
 * npm on Windows runs scripts through cmd.exe, where shell quoting differs.
 *
 * Config comes from the environment so no personal path is committed:
 *   EC2_HOST     api.theliledit.com
 *   EC2_USER     ubuntu
 *   EC2_APP_DIR  /home/ubuntu/lil-edit
 *   EC2_KEY      path to the .pem. Omit it if you have a matching ~/.ssh/config
 *                entry or the key loaded in an agent — ssh resolves it normally.
 *
 * Windows PowerShell, one-off:
 *   $env:EC2_KEY = "C:\Users\<you>\Downloads\lil.pem"; npm run deploy:remote
 *
 * Any extra args are forwarded as environment for the remote script, e.g.
 *   npm run deploy:remote -- DEPLOY_FORCE=1
 */

import { spawn } from "node:child_process";

const HOST = process.env.EC2_HOST ?? "api.theliledit.com";
const USER = process.env.EC2_USER ?? "ubuntu";
const APP_DIR = process.env.EC2_APP_DIR ?? "/home/ubuntu/lil-edit";
const KEY = process.env.EC2_KEY;

// Forwarded overrides must look like NAME=value — anything else is a typo we would
// otherwise splice into a remote shell command unquoted.
const forwarded = process.argv.slice(2);
const bad = forwarded.filter((a) => !/^[A-Z_][A-Z0-9_]*=[A-Za-z0-9._/:-]*$/.test(a));
if (bad.length) {
  console.error(`Unrecognised argument(s): ${bad.join(" ")}`);
  console.error("Only NAME=value overrides are forwarded, e.g. DEPLOY_FORCE=1");
  process.exit(2);
}

const remote = `cd ${APP_DIR}/backend && ${[...forwarded, "npm", "run", "deploy"].join(" ")}`;

const args = [
  // -t forces a pseudo-tty so deploy.sh's migration confirmation prompt is
  // interactive; without it the script sees no TTY and refuses to guess.
  "-t",
  "-o", "ConnectTimeout=15",
  ...(KEY ? ["-i", KEY] : []),
  `${USER}@${HOST}`,
  remote,
];

console.log(`→ ${USER}@${HOST}: npm run deploy\n`);

const ssh = spawn("ssh", args, { stdio: "inherit" });

ssh.on("error", (err) => {
  console.error(`\nCould not run ssh: ${err.message}`);
  process.exit(1);
});
ssh.on("close", (code) => process.exit(code ?? 1));
