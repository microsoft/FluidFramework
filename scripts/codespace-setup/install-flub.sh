#!/usr/bin/env bash
# Installs flub (the Fluid build CLI) globally by building the local
# build-tools workspace and linking it. This follows the same pattern
# used in CI (see tools/pipelines/templates/include-install-build-tools.yml).
#
# Prerequisites: node + corepack must already be set up (on-create.sh).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"

echo "Installing flub from local build-tools..."

# CI=true suppresses pnpm's interactive "purge modules" prompt in non-TTY environments.
# node-linker=hoisted uses a flat node_modules layout, which is much faster on
# Docker's overlayfs than pnpm's default hardlink-based approach.
CI=true pnpm -C "$REPO_ROOT/build-tools" install --frozen-lockfile --reporter=default \
  --config.node-linker=hoisted \
  --config.shamefully-hoist=true
pnpm -C "$REPO_ROOT/build-tools" build:compile

# Use npm link (not pnpm link) because it handles bin shims correctly.
npm link --prefix "$REPO_ROOT/build-tools/packages/build-cli"

echo "flub installed: $(which flub)"
flub --version
