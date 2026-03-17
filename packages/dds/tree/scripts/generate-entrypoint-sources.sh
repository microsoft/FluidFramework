#!/bin/bash

set -eu -o pipefail

# Generate entrypoint .d.ts files in lib/entrypoints, then transform them into
# source .ts files under src/entrypoints.

# This script is not inlined into package.json to avoid detection of outputs
# from fluid-build-tasks-tsc policy check that doesn't understand that the
# script is not a part of the regular build.
# This does clobber build output (detected correctly by policy check) and
# therefore a build should always be run after this script to restore validity
# of .d.ts files.

# 0. Make sure lib/entrypoints exists (a limitation of "flub generate entrypoints")

mkdir -p ./lib/entrypoints

# 1. Generate entrypoint .d.ts files in lib/entrypoints.

pnpm flub generate entrypoints --outFileLegacyBeta legacy --outDir ./lib/entrypoints

# 2. Copy generated .d.ts files to src/entrypoints as .ts files.
# A bug in "flub generate entrypoints" requires "./index.js" to be replaced with
# "../index.js" hence use of sed.

for tag in public beta alpha legacy; do
	sed "s|\./|../|" "./lib/entrypoints/${tag}.d.ts" > "./src/entrypoints/${tag}.ts"
done
