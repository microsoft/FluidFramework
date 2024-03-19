#!/bin/bash

# This script removes prettier and related build scripts from a project. You can run this script on a project after
# running the `add-biome.sh` script to completely switch away from prettier and to biome.
#
# THIS SCRIPT DOES NOT RUN ON WINDOWS.
#
# REQUIRED DEPENDENCIES:
#
# This script requires the `npe` package be installed globally. To do that run `pnpm add -g npe`.

# remove prettier scripts
npe scripts.format:prettier --delete
npe scripts.check:prettier --delete
npe scripts.prettier --delete
npe scripts.prettier:fix --delete

# remove prettier dep and config files
npe devDependencies.prettier --delete
rm -f .prettierignore prettier.config.cjs

# clean up lint task
npe scripts.lint "fluid-build . --task lint"
npe scripts.lint:fix "fluid-build . --task eslint:fix --task format"

pnpm run format
