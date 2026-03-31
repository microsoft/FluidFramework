#!/usr/bin/env bash
set -euo pipefail

# Skip if playwright-cli is not installed (controlled by the
# INSTALL_PLAYWRIGHT_CLI build arg in the Dockerfile).
if ! command -v playwright-cli &>/dev/null; then
  echo "playwright-cli not found, skipping playwright setup."
  exit 0
fi

echo "Installing playwright skills..."
playwright-cli install --skills
echo "Playwright skills installed."
