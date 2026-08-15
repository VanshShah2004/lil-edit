#!/usr/bin/env bash
#
# Sync this EC2 checkout to origin/main and restart the API.
#
# Run ON THE BOX, from the backend directory:
#   npm run deploy
#
# What it does:
#   fetch → refuse if dirty → flag unapplied migrations → ff-only pull →
#   npm ci (only if the lockfile moved) → tsc → pm2 restart → health check.
#
# What it deliberately does NOT do: run SQL migrations. This project applies them
# by hand in the Supabase SQL editor, and a half-applied schema is far worse than
# a late deploy. The script lists any migration that landed in the gap and makes
# you confirm you have already run it before it restarts anything.
#
# Overridable via env:
#   PM2_NAME (lil-edit-backend)  DEPLOY_BRANCH (main)
#   HEALTH_URL (http://localhost:5000/healthz)
#   DEPLOY_YES=1                 skip the migration prompt (for non-interactive runs)
#   DEPLOY_FORCE=1               rebuild + restart even when already at origin/main

set -euo pipefail

PM2_NAME="${PM2_NAME:-lil-edit-backend}"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/healthz}"

# Resolve the repo root from this script's own location (backend/scripts/) rather
# than $PWD, so the script behaves the same via `npm run deploy`, a bare `bash
# scripts/deploy.sh`, or an absolute path from cron.
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v pm2 >/dev/null 2>&1 || die "pm2 not found — is this the EC2 box? (run npm run deploy:remote from your laptop instead)"

cd "$REPO_ROOT"

# ── Pre-flight ────────────────────────────────────────────────────────────────

step "Fetching origin/$BRANCH"
git fetch origin "$BRANCH"

# Modified TRACKED files mean someone hot-patched production. Pulling over that
# either fails noisily or silently buries the change — refuse and let a human decide.
# Untracked files only warn: stray logs and scratch files are not a reason to block
# a deploy, though a pull that needs to write over one will fail on its own.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  die "Tracked files are modified. Inspect with 'git diff', then stash or discard before deploying."
fi

UNTRACKED="$(git ls-files --others --exclude-standard)"
if [ -n "$UNTRACKED" ]; then
  warn "Untracked files present (not blocking):"
  echo "$UNTRACKED" | sed 's/^/    /'
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT_BRANCH" = "$BRANCH" ] || die "On branch '$CURRENT_BRANCH', expected '$BRANCH'. Checkout $BRANCH first."

OLD_SHA="$(git rev-parse --short HEAD)"
NEW_SHA="$(git rev-parse --short "origin/$BRANCH")"

if [ "$OLD_SHA" = "$NEW_SHA" ] && [ "${DEPLOY_FORCE:-}" != "1" ]; then
  echo
  echo "Already at $NEW_SHA — nothing to deploy. (DEPLOY_FORCE=1 to rebuild anyway.)"
  exit 0
fi

AHEAD="$(git rev-list --count "HEAD..origin/$BRANCH")"
step "Deploying $OLD_SHA → $NEW_SHA  ($AHEAD commit(s))"

# ── Migration gate ────────────────────────────────────────────────────────────
# Migrations live in TWO directories in this repo and both still receive new files.
# Only newly ADDED files matter (-A); an edited migration was already applied under
# its old content and re-running is the author's call, not this script's.

MIGRATIONS="$(git diff --name-only --diff-filter=A "HEAD..origin/$BRANCH" \
  -- supabase/migrations lil-edit/supabase/migrations || true)"

if [ -n "$MIGRATIONS" ]; then
  warn "This range adds SQL migrations. Apply them in the Supabase SQL editor FIRST —"
  warn "new code against an old schema is the failure mode worth avoiding."
  echo "$MIGRATIONS" | sed 's/^/    /'
  echo
  if [ "${DEPLOY_YES:-}" = "1" ]; then
    echo "  DEPLOY_YES=1 — assuming these are already applied."
  elif [ -t 0 ]; then
    read -r -p "  Already applied all of the above? [y/N] " reply
    case "$reply" in
      [yY]|[yY][eE][sS]) ;;
      *) die "Aborted. Apply the migrations, then re-run." ;;
    esac
  else
    die "Migrations pending and no TTY to confirm on. Apply them, then re-run with DEPLOY_YES=1."
  fi
fi

# ── Pull ──────────────────────────────────────────────────────────────────────

step "Pulling"
git pull --ff-only origin "$BRANCH"

# Nothing under backend/ or shared/ changed → the frontend is on Render's own
# autoDeploy and needs nothing from us. Skip the rebuild and leave the process
# running; a pointless restart only drops in-flight requests for no gain.
BACKEND_CHANGED="$(git diff --name-only "$OLD_SHA..HEAD" -- backend shared || true)"
if [ -z "$BACKEND_CHANGED" ] && [ "${DEPLOY_FORCE:-}" != "1" ]; then
  echo
  echo "Now at $NEW_SHA. No backend/ or shared/ changes in this range — skipping rebuild and restart."
  echo "(Frontend ships via Render autoDeploy. DEPLOY_FORCE=1 to rebuild anyway.)"
  exit 0
fi

echo "$BACKEND_CHANGED" | sed 's/^/    /'

# ── Build ─────────────────────────────────────────────────────────────────────

cd "$BACKEND_DIR"

# npm ci wipes and reinstalls node_modules, so only pay for it when the lockfile
# actually moved. --include=dev is load-bearing: typescript is a devDependency and
# NODE_ENV=production in the environment would otherwise have npm omit it, leaving
# the next line to fail with "tsc: not found".
if git diff --name-only "$OLD_SHA..HEAD" -- backend/package-lock.json backend/package.json | grep -q .; then
  step "Lockfile changed — npm ci"
  npm ci --include=dev
else
  step "Lockfile unchanged — skipping npm ci"
fi

step "Building (tsc)"
npm run build

[ -f dist/server.js ] || die "Build produced no dist/server.js"

# dist/ is gitignored and tsc never prunes it, so a stray .env copied in there
# outlives every rebuild — and loadEnv.ts walks UP from dist/lib/, so it wins over
# the real backend/.env and edits to the latter silently do nothing.
if [ -f dist/.env ]; then
  warn "dist/.env exists and SHADOWS backend/.env (loadEnv.ts stops at the first .env going up)."
  warn "Edits to backend/.env will not take effect. Remove it with: rm $BACKEND_DIR/dist/.env"
fi

# ── Restart ───────────────────────────────────────────────────────────────────

step "Restarting $PM2_NAME"
pm2 restart "$PM2_NAME" --update-env
pm2 save

# ── Verify ────────────────────────────────────────────────────────────────────

step "Health check"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
  if [ "$code" = "200" ]; then
    printf '\n\033[1;32m✓ Deployed %s → %s and healthy.\033[0m\n' "$OLD_SHA" "$NEW_SHA"
    echo "  Rollback:  cd $REPO_ROOT && git checkout $OLD_SHA && cd backend && npm ci --include=dev && npm run build && pm2 restart $PM2_NAME --update-env"
    exit 0
  fi
  sleep 2
done

warn "Health check never returned 200 (last: ${code:-no response}) after ~20s."
pm2 logs "$PM2_NAME" --lines 40 --nostream || true
die "Deploy finished but the API is not healthy. Rollback:
  cd $REPO_ROOT && git checkout $OLD_SHA && cd backend && npm ci --include=dev && npm run build && pm2 restart $PM2_NAME --update-env"
