#!/bin/bash

set -eux -o pipefail

##################
# REMOVE PRETTIER
##################

# Add format script if needed
npe scripts.format "fluid-build . --task format"

# remove prettier scripts
npe scripts.format:prettier --delete
npe scripts.check:prettier --delete
npe scripts.prettier --delete
npe scripts.prettier:fix --delete
npe scripts.format:prettier:old --delete
npe scripts.check:prettier:old --delete

# remove prettier dep and config files
npe devDependencies.prettier --delete
rm -f .prettierignore prettier.config.cjs

pnpm run format
