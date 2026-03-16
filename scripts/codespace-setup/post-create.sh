#!/usr/bin/env bash
set -euo pipefail

# Determine which Node version to install. NODE_VERSION_OVERRIDE (set via
# containerEnv in devcontainer.json) takes precedence over .nvmrc.
NODE_VERSION="${NODE_VERSION_OVERRIDE:-}"

# nvm's internal functions use 'return N' for control flow which conflicts with
# set -e, so we source and invoke nvm in a subshell without -e.
(
  set +ex
  . /usr/local/share/nvm/nvm.sh
  nvm install ${NODE_VERSION}
) || { echo "nvm install failed"; exit 1; }

# Enable corepack to allow node to download and use the right version of pnpm
# (as specified by the packageManager field in package.json).
# Source nvm again in the current shell so the installed node is on PATH.
. /usr/local/share/nvm/nvm.sh
nvm use ${NODE_VERSION}
corepack enable
