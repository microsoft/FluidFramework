#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Install agent aliases system-wide so they're available in all shell sessions
# without modifying any user dotfiles (~/.bashrc, ~/.profile, etc.).
#
# Two hooks are needed because shells load different init files:
#   - /etc/profile.d/*.sh  → sourced by login shells (ssh, `bash -l`)
#   - /etc/bash/bashrc.d/  → sourced by interactive non-login shells (VS Code terminal)
#
# The aliases script uses bash-specific features (shopt, aliases), so
# /etc/profile.d/ gets a wrapper with a $BASH_VERSION guard to avoid
# errors when sourced by non-bash shells (e.g. /bin/sh via /etc/profile).

# Place the actual aliases in a neutral location
sudo install -Dm644 "$SCRIPT_DIR/agent-aliases.sh" /usr/local/lib/agent-aliases.sh

# Login shells: guarded wrapper in /etc/profile.d/
sudo tee /etc/profile.d/agent-aliases.sh > /dev/null <<'EOF'
# Guard against being sourced by non-bash shells (e.g., /bin/sh via /etc/profile).
[ -n "$BASH_VERSION" ] || return 0
# shellcheck disable=SC1091
. /usr/local/lib/agent-aliases.sh
EOF

# Interactive non-login shells (VS Code / Codespaces terminals):
# prefer /etc/bash/bashrc.d/ for symmetry; fall back to /etc/bash.bashrc.
if [ -d /etc/bash/bashrc.d ]; then
  sudo ln -sf /usr/local/lib/agent-aliases.sh /etc/bash/bashrc.d/agent-aliases.sh
elif ! sudo grep -qxF 'source /usr/local/lib/agent-aliases.sh' /etc/bash.bashrc 2>/dev/null; then
  echo "source /usr/local/lib/agent-aliases.sh" | sudo tee -a /etc/bash.bashrc > /dev/null
fi

bash "$SCRIPT_DIR/playwright-setup.sh"

# Agency is installed via the Dockerfile for AI-ready codespace configs.
