#!/usr/bin/env bash
# Installs @fluid-tools/build-cli (the `flub` CLI) globally from npm using pnpm.
#
# Prerequisites: node + pnpm must already be set up (on-create.sh), and
# PNPM_HOME must be on PATH (set in .devcontainer/Dockerfile).

set -euo pipefail

# We intentionally use the public npm registry here instead of publicPackages as this install does not have
# an associated lock file, and it's difficult to enforce that all transitive dependencies are saved to the
# publicPackages feed.
echo "Installing @fluid-tools/build-cli globally..."
CI=true pnpm add -g --registry=https://registry.npmjs.org/ --allow-build=core-js @fluid-tools/build-cli

echo "flub installed: $(which flub)"
flub --version
