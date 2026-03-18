#!/usr/bin/env bash
set -euo pipefail

echo "Installing playwright skills..."
playwright-cli install --skills
echo "Playwright skills installed."
