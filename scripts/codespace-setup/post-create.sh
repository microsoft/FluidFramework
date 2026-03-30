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

# Enable corepack to allow node to download and use the right version of pnpm
# (as specified by the packageManager field in package.json).
# Source nvm again in the current shell so the installed node is on PATH.
set +u
. /usr/local/share/nvm/nvm.sh
nvm use ${NODE_VERSION}
set -u
corepack enable
