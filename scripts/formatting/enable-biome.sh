#!/bin/bash

set -eux -o pipefail

#######################
# ENABLE BIOME SCRIPTS
#######################

# Update format scripts
npe scripts.format "npm run format:biome"
npe scripts.check:format "npm run check:biome"

pnpm run format
