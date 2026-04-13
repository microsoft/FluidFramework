#!/usr/bin/env bash
# Installs flub (the Fluid build CLI) globally by building the local
# build-tools workspace and linking it. This follows the same pattern
# used in CI (see tools/pipelines/templates/include-install-build-tools.yml).
#
# Prerequisites: node + corepack must already be set up (on-create.sh).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"

echo "Installing flub from local build-tools..."

# Use a named volume for the store (mounted at /pnpm-store in the devcontainer)
# to avoid slow hardlinking on Docker's overlayfs.
STORE_DIR="${PNPM_STORE_DIR:-}"
if [ -d /pnpm-store ]; then
  STORE_DIR="/pnpm-store"
fi

pnpm -C "$REPO_ROOT/build-tools" install --frozen-lockfile --reporter=default \
  ${STORE_DIR:+--store-dir "$STORE_DIR"}
pnpm -C "$REPO_ROOT/build-tools" build:compile

# Use npm link (not pnpm link) because it handles bin shims correctly.
npm link --prefix "$REPO_ROOT/build-tools/packages/build-cli"

echo "flub installed: $(which flub)"
flub --version
