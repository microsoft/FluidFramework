#!/bin/bash

set -eux -o pipefail

##################
# ENABLE PRETTIER
##################

npe scripts.check:format "npm run prettier"
npe scripts.format "npm run prettier:fix"
dot-json package.json fluidBuild.tasks.format '{"script": true}' --json-value
dot-json package.json fluidBuild.tasks.check:format '{"script": true}' --json-value
