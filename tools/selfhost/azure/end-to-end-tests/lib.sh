#!/usr/bin/env bash
# Supporting functions for end-to-end-tests.sh parameter loading, tool checks, 
# Azure authentication and endpoint discovery, and custom routerlicious driver configuration.

E2E_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELFHOST_ROOT="$(cd "$E2E_LIB_DIR/../.." && pwd)"
PARAMETERS_FILE="$E2E_LIB_DIR/end-to-end-tests.parameters.json"

# Values updated by Azure authentication and discovery.
ALFRED_HOST=""
NEXUS_HOST=""
HISTORIAN_HOST=""
TENANT_SECRET=""

jqr() { jq -r "$1 // empty" "$PARAMETERS_FILE"; }

# Verify each named command-line tool is available on PATH.
require_tools() {
  local tool
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: required tool '$tool' not found." >&2; exit 1; }
  done
}

# Read the target deployment and optional manual credential values from the parameters file.
load_parameters() {
  [ -f "$PARAMETERS_FILE" ] || { echo "ERROR: parameters file not found: $PARAMETERS_FILE" >&2; exit 1; }

  SUB="$(jqr '.subscriptionId')"
  RG="$(jqr '.resourceGroup')"
  AKS="$(jqr '.aks.name')"
  AFD="$(jqr '.frontDoor.profileName')"
  TENANT_ID="$(jqr '.tenantId')"; TENANT_ID="${TENANT_ID:-fluid}"

  if [ -z "$RG" ]; then
    echo "ERROR: 'resourceGroup' is required in $PARAMETERS_FILE." >&2
    exit 1
  fi
  if [ -z "$AKS" ]; then
    echo "ERROR: 'aks.name' is required in $PARAMETERS_FILE." >&2
    exit 1
  fi
  if [ -z "$AFD" ]; then
    echo "ERROR: 'frontDoor.profileName' is required in $PARAMETERS_FILE." >&2
    exit 1
  fi
}

# Interactive Azure authentication and deployment discovery.
# Uses tenant-admin.sh to retrieve a tenant key for the specified tenantId.
configure_test_environment() {
  echo "Authenticating to Azure"
  if ! az account show >/dev/null 2>&1; then
    echo "No active Azure CLI session found. Launching 'az login' to authenticate."
    if ! az login; then
      echo "ERROR: Azure authentication failed." >&2
      return 1
    fi
  fi
  if [ -n "$SUB" ] && ! az account set --subscription "$SUB"; then
    echo "ERROR: could not select Azure subscription '$SUB'." >&2
    return 1
  fi

  echo "Retrieving credentials for AKS cluster '$AKS' in '$RG'..."
  if ! az aks get-credentials -g "$RG" -n "$AKS" --overwrite-existing >/dev/null; then
    echo "ERROR: could not retrieve AKS credentials." >&2
    return 1
  fi

  echo "Discovering Front Door endpoints for profile '$AFD' in resource group '$RG'..."
  ALFRED_HOST="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "alfred-$AFD" --query hostName -o tsv)"
  NEXUS_HOST="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "nexus-$AFD" --query hostName -o tsv)"
  HISTORIAN_HOST="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "historian-$AFD" --query hostName -o tsv)"
  if [ -z "$ALFRED_HOST" ]; then
    echo "ERROR: could not discover the Alfred endpoint." >&2
    return 1
  fi
  if [ -z "$NEXUS_HOST" ]; then
    echo "ERROR: could not discover the Nexus endpoint." >&2
    return 1
  fi
  if [ -z "$HISTORIAN_HOST" ]; then
    echo "ERROR: could not discover the Historian endpoint." >&2
    return 1
  fi
  echo "  Alfred:    https://$ALFRED_HOST"
  echo "  Nexus:     https://$NEXUS_HOST"
  echo "  Historian: https://$HISTORIAN_HOST"

  echo "Fetching tenant key for '$TENANT_ID'."
  if ! TENANT_SECRET="$("$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMETERS_FILE" get-key "$TENANT_ID" --key key1 | jq -r '.key1 // empty')" || [ -z "$TENANT_SECRET" ]; then
    echo "ERROR: could not retrieve the tenant key." >&2
    return 1
  fi
}

# Export the custom driver configuration built from the discovered endpoints and tenant secret.
export_custom_driver_config() {
  export fluid__test__driver__custom
  fluid__test__driver__custom="$(jq -n \
    --arg tenantId "$TENANT_ID" \
    --arg tenantSecret "$TENANT_SECRET" \
    --arg host "https://$ALFRED_HOST" \
    --arg ordererUrl "https://$ALFRED_HOST" \
    --arg deltaStorageUrl "https://$HISTORIAN_HOST" \
    --arg deltaStreamUrl "https://$NEXUS_HOST" \
    '{tenantId: $tenantId, tenantSecret: $tenantSecret, host: $host, ordererUrl: $ordererUrl, deltaStorageUrl: $deltaStorageUrl, deltaStreamUrl: $deltaStreamUrl}')"
}
