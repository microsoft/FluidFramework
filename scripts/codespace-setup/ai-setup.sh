#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Install agent aliases system-wide so they're available in all shell sessions
# without modifying any user dotfiles (~/.bashrc, ~/.profile, etc.).
#
# Three hooks are needed because shells load different init files:
#   - /etc/profile.d/*.sh      → sourced by login shells (ssh, `bash -l`)
#   - /etc/bash/bashrc.d/      → sourced by interactive bash non-login shells (VS Code terminal)
#   - /etc/zsh/zshrc.d/ or
#     /etc/zsh/zshrc            → sourced by interactive zsh shells
#
# The aliases script guards against non-bash/zsh shells internally, so a direct
# symlink works for all hooks.

# Place the actual aliases in a neutral location
sudo install -Dm644 "$SCRIPT_DIR/agent-aliases.sh" /usr/local/lib/agent-aliases.sh

# Login shells: direct symlink — the script guards against non-bash/zsh shells internally.
sudo ln -sf /usr/local/lib/agent-aliases.sh /etc/profile.d/agent-aliases.sh

# Interactive non-login shells (VS Code / Codespaces terminals):
# prefer /etc/bash/bashrc.d/ for symmetry; fall back to /etc/bash.bashrc.
if [ -d /etc/bash/bashrc.d ]; then
  sudo ln -sf /usr/local/lib/agent-aliases.sh /etc/bash/bashrc.d/agent-aliases.sh
elif ! sudo grep -qxF 'source /usr/local/lib/agent-aliases.sh' /etc/bash.bashrc 2>/dev/null; then
  echo "source /usr/local/lib/agent-aliases.sh" | sudo tee -a /etc/bash.bashrc > /dev/null
fi

# Zsh interactive shells: prefer /etc/zsh/zshrc.d/ if available; fall back to /etc/zsh/zshrc.
if [ -d /etc/zsh/zshrc.d ]; then
  sudo ln -sf /usr/local/lib/agent-aliases.sh /etc/zsh/zshrc.d/agent-aliases.sh
elif [ -f /etc/zsh/zshrc ] && ! sudo grep -qxF 'source /usr/local/lib/agent-aliases.sh' /etc/zsh/zshrc 2>/dev/null; then
  echo "source /usr/local/lib/agent-aliases.sh" | sudo tee -a /etc/zsh/zshrc > /dev/null
elif [ -f /etc/zshrc ] && ! sudo grep -qxF 'source /usr/local/lib/agent-aliases.sh' /etc/zshrc 2>/dev/null; then
  echo "source /usr/local/lib/agent-aliases.sh" | sudo tee -a /etc/zshrc > /dev/null
fi

bash "$SCRIPT_DIR/playwright-setup.sh"
