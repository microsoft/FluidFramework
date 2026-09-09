#!/usr/bin/env bash
# Provision the build/staging registry (ACR) used to build & push a self-host release's images.
#
# The release flow builds the Fluid server ahead of deploy time and pushes the resulting images to a
# registry, so that registry must exist *before* build-images.sh / generate-release.sh run. This
# script creates or reuses and authenticates to the ACR.
#
# Usage:
#   ./release/setup-build-registry.sh <acr-name>
#   ACR_NAME=<acr-name> ./release/setup-build-registry.sh
#
# Optional overrides (environment variables):
#   PARAMETERS_FILE Deploy parameters file (default: azure/deploy.parameters.json).
#   LOCATION        Azure region for the group/registry (default: .location from PARAMETERS_FILE).
#   SUBSCRIPTION    Subscription id/name to target (default: current az context).
#   ACR_SKU         ACR SKU (default: Standard).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELFHOST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/lib.sh"

# --- Inputs ------------------------------------------------------------------
ACR_NAME="${1:-${ACR_NAME:-}}"
[ -n "$ACR_NAME" ] || fail "no ACR name given. Pass it as the first argument (or set ACR_NAME)."
[[ "$ACR_NAME" =~ ^[a-z0-9]{5,50}$ ]] \
  || fail "invalid ACR name '$ACR_NAME' (must be 5-50 lowercase alphanumeric characters, globally unique)."

PARAMETERS_FILE="${PARAMETERS_FILE:-$SELFHOST_ROOT/azure/deploy.parameters.json}"
[ -f "$PARAMETERS_FILE" ] || fail "parameters file not found: $PARAMETERS_FILE (copy azure/deploy.parameters.example.json)."
command -v jq >/dev/null 2>&1 || fail "jq is required to read resourceGroup from $PARAMETERS_FILE."

RESOURCE_GROUP="$(jq -r '.resourceGroup // empty' "$PARAMETERS_FILE")"
[ -n "$RESOURCE_GROUP" ] || fail "no .resourceGroup in $PARAMETERS_FILE."
LOCATION="${LOCATION:-$(jq -r '.location // empty' "$PARAMETERS_FILE")}"
[ -n "$LOCATION" ] || fail "no .location in $PARAMETERS_FILE; update the value in the parameters file or set the LOCATION environment variable."
ACR_SKU="${ACR_SKU:-Standard}"

log() { printf '[setup-build-registry] %s\n' "$*" >&2; }

# --- Preflight ---------------------------------------------------------------
command -v az >/dev/null 2>&1 || fail "az (Azure CLI) is required."

if ! az account show >/dev/null 2>&1; then
  log "No active az session detected — launching az login"
  az login --only-show-errors >/dev/null
fi
if [ -n "${SUBSCRIPTION:-}" ]; then
  az account set --subscription "$SUBSCRIPTION"
  log "Active subscription set to $SUBSCRIPTION"
fi

# --- Resource group ----------------------------------------------------------
if az group show -n "$RESOURCE_GROUP" >/dev/null 2>&1; then
  log "Resource group $RESOURCE_GROUP already exists, skipping create"
else
  log "Creating resource group $RESOURCE_GROUP in $LOCATION"
  az group create -n "$RESOURCE_GROUP" -l "$LOCATION" --only-show-errors >/dev/null
fi

# --- ACR ---------------------------------------------------------------------
if EXISTING_ACR_RESOURCE_GROUP="$(az acr show -n "$ACR_NAME" --query resourceGroup -o tsv 2>/dev/null)" \
  && [ -n "$EXISTING_ACR_RESOURCE_GROUP" ]; then
  log "ACR $ACR_NAME already exists in resource group $EXISTING_ACR_RESOURCE_GROUP, skipping create"
else
  log "Creating ACR $ACR_NAME ($ACR_SKU) in $LOCATION"
  az acr create -g "$RESOURCE_GROUP" -n "$ACR_NAME" -l "$LOCATION" \
    --sku "$ACR_SKU" --admin-enabled false --only-show-errors >/dev/null
fi

[ "$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query provisioningState -o tsv)" = "Succeeded" ] \
  || fail "ACR $ACR_NAME was not created successfully."
if [ "$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query adminUserEnabled -o tsv)" = "true" ]; then
  log "Disabling the admin account on existing ACR $ACR_NAME"
  az acr update -g "$RESOURCE_GROUP" -n "$ACR_NAME" --admin-enabled false --only-show-errors >/dev/null
fi
[ "$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query adminUserEnabled -o tsv)" = "false" ] \
  || fail "ACR $ACR_NAME admin account is still enabled."

# --- Authenticate for docker push ---------------------------------------------
log "Authenticating docker to $ACR_NAME (az acr login)"
az acr login -n "$ACR_NAME" >/dev/null

# --- Print the login server name (the only stdout line) ------------------------
LOGIN_SERVER="$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query loginServer -o tsv)"
[ -n "$LOGIN_SERVER" ] || fail "could not resolve login server for ACR $ACR_NAME."
log "Build registry ready: $LOGIN_SERVER"
printf '%s\n' "$LOGIN_SERVER"
