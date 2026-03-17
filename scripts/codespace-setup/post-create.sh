#!/usr/bin/env bash
set -euo pipefail

# Determine which Node version to install. NODE_VERSION_OVERRIDE (set via
# containerEnv in devcontainer.json) takes precedence over .nvmrc.
NODE_VERSION="${NODE_VERSION_OVERRIDE:-}"

# Only pass a version argument to nvm when one is provided.
NVM_VERSION_ARGS=()
if [[ -n "${NODE_VERSION}" ]]; then
  NVM_VERSION_ARGS+=("${NODE_VERSION}")
fi

# nvm's internal functions use 'return N' for control flow which conflicts with
# set -e, so we source and invoke nvm in a subshell without -e.
(
  set +ex
  # shellcheck disable=SC1091
  . /usr/local/share/nvm/nvm.sh
  nvm install "${NVM_VERSION_ARGS[@]}"
) || { echo "nvm install failed"; exit 1; }

# Enable corepack to allow node to download and use the right version of pnpm
# (as specified by the packageManager field in package.json).
# Source nvm again in the current shell so the installed node is on PATH.
# shellcheck disable=SC1091
. /usr/local/share/nvm/nvm.sh
nvm use "${NVM_VERSION_ARGS[@]}"
corepack enable
