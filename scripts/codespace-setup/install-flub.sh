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
# --ignore-scripts skips postinstall lifecycle hooks that run lint setup and nested pnpm
# installs — neither is needed here since we only need to compile and link the CLI.
CI=true pnpm -C "$REPO_ROOT/build-tools" install --frozen-lockfile --reporter=default \
  --ignore-scripts
pnpm -C "$REPO_ROOT/build-tools" build:compile

# Use npm link (not pnpm link) because it handles bin shims correctly.
# Must cd into the package — npm link --prefix doesn't install global shims.
(cd "$REPO_ROOT/build-tools/packages/build-cli" && npm link)

echo "flub installed: $(which flub)"
flub --version
