#!/bin/bash

set -eux -o pipefail

##################
# ENABLE PRETTIER
##################

# Add format script if needed
npe scripts.format "fluid-build . --task format"

npe scripts.check:biome "biome format ."
npe scripts.format:biome "biome format . --write"

sd --fixed-strings '"check:biome": "b' '"check:biome:old": "b' package.json
sd --fixed-strings '"format:biome": "b' '"format:biome:old": "b' package.json

sd --fixed-strings '"check:prettier:old": "p' '"check:prettier": "p' package.json
sd --fixed-strings '"format:prettier:old": "p' '"format:prettier": "p' package.json

pnpm run format
