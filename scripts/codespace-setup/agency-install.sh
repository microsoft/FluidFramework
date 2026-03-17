#!/usr/bin/env bash
set -euo pipefail

# Skip unless explicitly requested (controlled by the INSTALL_AGENCY build arg in the Dockerfile).
if [ "${INSTALL_AGENCY:-}" != "true" ]; then
  echo "INSTALL_AGENCY not set, skipping agency setup."
  exit 0
fi

echo "Installing agency..."
curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency
echo "Agency installed."
