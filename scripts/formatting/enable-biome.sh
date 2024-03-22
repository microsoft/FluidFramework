#!/bin/bash

set -eux -o pipefail

###############
# ENABLE BIOME
###############

npe scripts.check:format "npm run check:biome"
npe scripts.format "npm run format:biome"
dot-json package.json fluidBuild.tasks.format '{"script": true}' --json-value
dot-json package.json fluidBuild.tasks.check:format '{"script": true}' --json-value

pnpm run format
