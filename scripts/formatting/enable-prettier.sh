#!/bin/bash

set -eux -o pipefail

##########################
# ENABLE PRETTIER SCRIPTS
##########################

# Update format scripts
npe scripts.format "npm run format:prettier"
npe scripts.check:format "npm run check:prettier"

pnpm run format
