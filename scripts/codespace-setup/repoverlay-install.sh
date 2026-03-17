#!/usr/bin/env bash
set -euo pipefail

# Skip unless explicitly requested (controlled by the INSTALL_REPOVERLAY build arg in the Dockerfile).
if [ "${INSTALL_REPOVERLAY:-}" != "true" ]; then
  echo "INSTALL_REPOVERLAY not set, skipping repoverlay setup."
  exit 0
fi

echo "Installing repoverlay..."
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/tylerbutler/repoverlay/releases/latest/download/repoverlay-installer.sh | sh
echo "Repoverlay installed."
