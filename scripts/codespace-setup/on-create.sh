#!/usr/bin/env bash
set -euo pipefail

# Determine which Node version to install. NODE_VERSION_OVERRIDE (set via
# containerEnv in devcontainer.json) takes precedence over .nvmrc.
NODE_VERSION="${NODE_VERSION_OVERRIDE:-}"

# nvm's internal functions use 'return N' for control flow which conflicts with
# set -e, and reference unset variables which conflicts with set -u. Source and
# invoke nvm in a subshell with both disabled.
(
  set +exu
  . /usr/local/share/nvm/nvm.sh
  nvm install ${NODE_VERSION}
) || { echo "nvm install failed"; exit 1; }

# Install the pnpm version specified by packageManager through npm, as in CI.
# Corepack cannot bootstrap from publicPackages until its version metadata endpoint is supported.
# Once installed, pnpm handles later packageManager version changes without Corepack.
# Source nvm again in the current shell so the installed node is on PATH.
set +u
. /usr/local/share/nvm/nvm.sh
nvm use ${NODE_VERSION}
set -u
if command -v corepack >/dev/null 2>&1; then
  corepack disable pnpm
fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PNPM_VERSION="$(node -p "require(process.argv[1]).packageManager.split('+')[0]" "$REPO_ROOT/package.json")"
npm install -g "$PNPM_VERSION" --registry=https://pkgs.dev.azure.com/fluidframework/public/_packaging/publicPackages/npm/registry/
pnpm --version
