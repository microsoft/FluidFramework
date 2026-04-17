#!/usr/bin/env bash
# Fetches Component Governance alerts from the ADO API and saves the raw JSON to files.
#
# Usage: bash fetch-cg-alerts.sh [output-dir]
#   output-dir: directory to write JSON files (default: ${HOME}/.cg-alerts)
#
# Produces two files:
#   <output-dir>/production.json       — alerts from production pipelines (pipelinesTrackingFilter=0)
#   <output-dir>/non-production.json   — alerts from non-production/stale pipelines (pipelinesTrackingFilter=1)
#
# Prerequisites:
#   - The `az` shim must be available (standard in Fluid Framework codespaces)
#   - The shim must be able to acquire a Bearer token for ADO
#
# The API endpoint is the same one the CG SPA uses. Each response is large (20-60MB)
# because it includes all alerts (active, fixed, dismissed) with full descriptions.

set -euo pipefail

OUTPUT_DIR="${1:-${HOME}/.cg-alerts}"
mkdir -p "$OUTPUT_DIR"

# ADO org/project constants for FluidFramework
ORG="fluidframework"
PROJECT_ID="235294da-091d-4c29-84fc-cdfc3d90890b"
REPO_ID="17385"   # CG registration ID for this repo
BRANCH="main"

if [[ -n "${ADO_TOKEN:-}" ]]; then
  TOKEN="$ADO_TOKEN"
else
  TOKEN=$(az account get-access-token --query accessToken -o tsv 2>/dev/null)
fi
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Could not acquire access token. Set ADO_TOKEN env or configure the az shim." >&2
  exit 1
fi

BASE_URL="https://governance.dev.azure.com/${ORG}/${PROJECT_ID}/_apis/ComponentGovernance/GovernedRepositories/${REPO_ID}/Branches/${BRANCH}/Alerts?includeHistory=false&includeDevelopmentDependencies=true"

fetch_alerts() {
  local filter="$1"
  local label="$2"
  local output="$3"

  echo "Fetching ${label} alerts (pipelinesTrackingFilter=${filter})..." >&2
  HTTP_CODE=$(curl -s -o "$output" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "${BASE_URL}&pipelinesTrackingFilter=${filter}")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "ERROR: API returned HTTP $HTTP_CODE for ${label}" >&2
    head -c 500 "$output" >&2
    exit 1
  fi

  FILE_SIZE=$(wc -c < "$output")
  echo "  Saved ${FILE_SIZE} bytes to ${output}" >&2
}

fetch_alerts 0 "production" "${OUTPUT_DIR}/production.json"
fetch_alerts 1 "non-production" "${OUTPUT_DIR}/non-production.json"

echo "Done. Files saved to ${OUTPUT_DIR}/" >&2
