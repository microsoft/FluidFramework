#!/bin/bash

# IMPORTANT: This script requires the `npe` package be installed globally. To do that run `pnpm add -g npe`. It also
# needs fd and sd, modern find and sed replacements.

set -eux -o pipefail

# add biome dependency
npe "devDependencies.@biomejs/biome" "^1.6.1"

# add organize-imports scripts
npe scripts.check:biome "biome check ."
npe scripts.format:biome "biome check --apply ."
npe scripts.format "fluid-build --task format ."
npe scripts.lint:fix "fluid-build . --task eslint:fix --task format"

# Add deps in case they're missing
npe devDependencies.@fluidframework/build-tools "^0.34.0"
npe devDependencies.prettier "~3.0.3"

# Replace prettier and prettier:fix with check:prettier and format:prettier
fd --glob "**/package.json" --exec sd --fixed-strings '"prettier:fix": "' '"format:prettier": "'
fd --glob "**/package.json" --exec sd --fixed-strings '"prettier": "' '"check:prettier": "'

# # add biome formatting and check scripts
# npe scripts.format "fluid-build --task format ."
# # npe scripts.format:biome "biome format --write ."
# npe scripts.check:biome "biome check ."
# npe scripts.check:format "fluid-build --task check:format ."

# # remove prettier scripts
# npe scripts.format:prettier --delete
# npe scripts.check:prettier --delete
# npe scripts.prettier --delete
# npe scripts.prettier:fix --delete

# # remove prettier dep and config files
# npe devDependencies.prettier --delete
# rm -f .prettierignore prettier.config.cjs

# # clean up lint task
npe scripts.lint "fluid-build . --task lint"
# npe scripts.lint:fix "npm run eslint:fix"

# hyperfine --runs 10 --warmup 1 \
# -L command 'prettier:fix','format:biome' \
# 'cd packages/dds/tree ; pnpm run {command}'
