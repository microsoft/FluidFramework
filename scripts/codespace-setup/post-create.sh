#!/usr/bin/env bash
set -euo pipefail

# Invoke 'nvm' to install our preferred version of node, per the '.nvmrc' file
# located at the root of the ${workspaceFolder}.
. /usr/local/share/nvm/nvm.sh
nvm install

# Enable corepack to allow node to download and use the right version of pnpm
# (as specified by the packageManager field in package.json).
corepack enable
