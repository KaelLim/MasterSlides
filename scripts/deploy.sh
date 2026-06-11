#!/usr/bin/env bash
# Deploy MasterSlides to Cloudflare Pages.
#
# This Pages project (`slides`) is Direct-Upload mode — NOT git-connected.
# A `git push` does NOT trigger a deploy; you have to run this script
# (or `bun run deploy`).
#
# Reads CF creds from ./key.md (gitignored, KEY=VALUE format), then runs
# `bun run build` followed by `wrangler pages deploy public`.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f key.md ]]; then
  echo "✗ key.md missing — expected at $(pwd)/key.md" >&2
  echo "  Format: KEY=VALUE per line. Must define CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN." >&2
  exit 1
fi

# Source key.md into the environment. set -a auto-exports every assignment;
# set +a restores the prior behaviour so we don't leak the toggle elsewhere.
set -a
# shellcheck disable=SC1091
. ./key.md
set +a

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "✗ key.md must define CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN" >&2
  exit 1
fi

echo "→ Building client bundles..."
bun run build

echo "→ Deploying to Cloudflare Pages (project: slides)..."
bunx wrangler pages deploy public \
  --project-name=slides \
  --branch=main \
  --commit-hash="$(git rev-parse HEAD)" \
  --commit-message="$(git log -1 --pretty=%s)" \
  --commit-dirty=true
