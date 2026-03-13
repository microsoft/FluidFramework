#!/usr/bin/env bash
set -euo pipefail

echo "Setting up playwright CLI..."
npm install -g @playwright/cli@latest
echo "Playwright CLI installed."

echo "Installing playwright skills..."
playwright-cli install --skills
echo "Playwright skills installed."
