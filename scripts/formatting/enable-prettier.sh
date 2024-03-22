#!/bin/bash

set -eux -o pipefail

##################
# ENABLE PRETTIER
##################

npe scripts.check:format "fluid-build --task check:format ."
npe scripts.format "fluid-build --task format ."
dot-json package.json fluidBuild.tasks.format '{"script": true}' --json-value
dot-json package.json fluidBuild.tasks.check:format '{"script": true}' --json-value
