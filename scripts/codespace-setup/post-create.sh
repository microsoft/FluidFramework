#!/usr/bin/env bash
set -euo pipefail

# Invoke 'nvm' to install our preferred version of node, per the '.nvmrc' file
# located at the root of the ${workspaceFolder}.
. /usr/local/share/nvm/nvm.sh
nvm install

# `npm i -g corepack@latest;` and  `corepack prepare pnpm@latest --activate;` are necessary to get the latest
# version of corepack, which has a fix for https://github.com/nodejs/corepack/issues/612
# (related https://github.com/pnpm/pnpm/issues/9029), so it can install pnpm.
# Those two can probably go away once the devcontainer is using a version of Node which includes a version corepack
# with the fix.
npm i -g corepack@latest
corepack prepare pnpm@latest --activate

# Also run corepack enable to allow node to download and use the right version of pnpm.
corepack enable
