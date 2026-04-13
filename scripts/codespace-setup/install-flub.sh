#!/usr/bin/env bash
# Installs flub (the Fluid build CLI) globally by building the local
# build-tools workspace and linking it. This follows the same pattern
# used in CI (see tools/pipelines/templates/include-install-build-tools.yml).
#
# Prerequisites: node + corepack must already be set up (on-create.sh).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"

echo "Installing flub from local build-tools..."

cd "$REPO_ROOT/build-tools"
pnpm install --frozen-lockfile
pnpm build:compile

cd packages/build-cli
# Use npm link (not pnpm link) because it handles bin shims correctly.
npm link

echo "flub installed: $(which flub)"
flub --version
