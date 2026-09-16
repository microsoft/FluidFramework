#!/usr/bin/env bash
# Installs @fluid-tools/build-cli (the `flub` CLI) globally from npm using pnpm.
#
# Prerequisites: node + corepack must already be set up (on-create.sh), and
# PNPM_HOME must be on PATH (set in .devcontainer/Dockerfile).

set -euo pipefail

echo "Installing @fluid-tools/build-cli globally..."
CI=true pnpm add -g --allow-build=core-js @fluid-tools/build-cli

echo "flub installed: $(which flub)"
flub --version
