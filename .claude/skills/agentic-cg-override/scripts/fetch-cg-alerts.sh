#!/usr/bin/env bash
# Fetches Component Governance alerts from the ADO API and saves the raw JSON to files.
#
# Usage: bash fetch-cg-alerts.sh [output-dir]
#   output-dir: directory to write JSON files (default: <repo-root>/.cg-alerts)
#
# Produces two files:
#   <output-dir>/production.json       — alerts from production pipelines (pipelinesTrackingFilter=0)
#   <output-dir>/non-production.json   — alerts from non-production/stale pipelines (pipelinesTrackingFilter=1)
#
# Prerequisites:
#   Azure CLI is installed and signed in (`az login`). The script acquires an ADO bearer
#   token directly via `az account get-access-token`. Matches the pattern used by the
#   published `component-governance-alerts` marketplace plugin.
#
# The API endpoint is the same one the CG SPA uses. Each response is large (20-60MB)
# because it includes all alerts (active, fixed, dismissed) with full descriptions.

set -euo pipefail

DEFAULT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")/.cg-alerts"
OUTPUT_DIR="${1:-$DEFAULT_DIR}"
mkdir -p "$OUTPUT_DIR"

# ADO org/project constants for FluidFramework
ORG="fluidframework"
PROJECT_ID="235294da-091d-4c29-84fc-cdfc3d90890b"
REPO_ID="17385"   # CG registration ID for this repo
BRANCH="main"

# ADO Component Governance resource ID — constant across all ADO orgs.
ADO_CG_RESOURCE="499b84ac-1321-427f-aa17-267ca6975798"

if ! command -v az >/dev/null 2>&1; then
  echo "ERROR: \`az\` (Azure CLI) is not on PATH." >&2
  echo "Install it: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

TOKEN=$(az account get-access-token --resource "$ADO_CG_RESOURCE" --query accessToken -o tsv)
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: \`az account get-access-token\` returned no token. Run \`az login\` first." >&2
  exit 1
fi

BASE_URL="https://governance.dev.azure.com/${ORG}/${PROJECT_ID}/_apis/ComponentGovernance/GovernedRepositories/${REPO_ID}/Branches/${BRANCH}/Alerts?includeHistory=false&includeDevelopmentDependencies=true"

fetch_alerts() {
  local filter="$1"
  local label="$2"
  local output="$3"
  local http_code file_size

  echo "Fetching ${label} alerts (pipelinesTrackingFilter=${filter})..." >&2
  http_code=$(curl -sS -o "$output" -w "%{http_code}" \
    --connect-timeout 10 --max-time 120 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "${BASE_URL}&pipelinesTrackingFilter=${filter}")

  if [[ "$http_code" != "200" ]]; then
    echo "ERROR: API returned HTTP $http_code for ${label}" >&2
    head -c 500 "$output" >&2
    exit 1
  fi

  file_size=$(wc -c < "$output")
  echo "  Saved ${file_size} bytes to ${output}" >&2
}

fetch_alerts 0 "production" "${OUTPUT_DIR}/production.json"
fetch_alerts 1 "non-production" "${OUTPUT_DIR}/non-production.json"

echo "Done. Files saved to ${OUTPUT_DIR}/" >&2
