#!/bin/bash

set -eux -o pipefail

##################
# ENABLE PRETTIER
##################

npe scripts.check:format "fluid-build . --task check:format"
npe scripts.format "fluid-build . --task format"

npe scripts.check:biome "biome check . --formatter-enabled=false"
npe scripts.format:biome "biome check . --apply --formatter-enabled=false"

sd --fixed-strings '"check:prettier:old": "p' '"check:prettier": "p' package.json
sd --fixed-strings '"format:prettier:old": "p' '"format:prettier": "p' package.json

# dot-json package.json fluidBuild.tasks.format '{"script": true}' --json-value
# dot-json package.json fluidBuild.tasks.check:format '{"script": true}' --json-value

pnpm run format
