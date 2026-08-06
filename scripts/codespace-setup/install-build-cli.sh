#!/usr/bin/env bash
# Installs @fluid-tools/build-cli (the `flub` CLI) globally from npm using pnpm.
#
# Prerequisites: node + corepack must already be set up (on-create.sh), and
# PNPM_HOME/bin must be on PATH (set in .devcontainer/Dockerfile).

set -euo pipefail

echo "Installing @fluid-tools/build-cli and its Copilot CLI runtime globally..."
pnpm add -g @fluid-tools/build-cli '@github/copilot@^1.0.43'

echo "flub installed: $(which flub)"
flub --version
