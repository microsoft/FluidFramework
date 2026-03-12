#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/agent-aliases.sh"

bash "$SCRIPT_DIR/playwright-setup.sh"

# Agency is installed via the Dockerfile for AI-ready codespace configs.
