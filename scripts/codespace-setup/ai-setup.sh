#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Install agent aliases system-wide so they're available in all shell sessions
# without modifying any user dotfiles (~/.bashrc, ~/.profile, etc.).
#
# Two hooks are needed because shells load different init files:
#   - /etc/profile.d/*.sh  → sourced by login shells (ssh, `bash -l`)
#   - /etc/bash.bashrc     → sourced by interactive non-login shells (VS Code terminal)
#
# VS Code / Codespaces terminals are non-login interactive shells, so
# /etc/profile.d/ alone isn't enough — the /etc/bash.bashrc append covers that case.
sudo cp "$SCRIPT_DIR/agent-aliases.sh" /etc/profile.d/agent-aliases.sh
echo "source /etc/profile.d/agent-aliases.sh" | sudo tee -a /etc/bash.bashrc > /dev/null

bash "$SCRIPT_DIR/playwright-setup.sh"

# Agency is installed via the Dockerfile for AI-ready codespace configs.
