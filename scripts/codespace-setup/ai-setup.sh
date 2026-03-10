#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/agent-aliases.sh"

bash "$SCRIPT_DIR/playwright-setup.sh"

echo "Installing Agency, which will require you to authenticate, so look for a popup window..."
curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency
