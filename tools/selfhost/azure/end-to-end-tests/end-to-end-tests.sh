#!/usr/bin/env bash
# Run FluidFramework's end-to-end test suite test:realsvc:r11s) from a local FluidFramework checkout 
# against an AKS cluster.
#
# Prerequisites:
#   - az, jq, kubectl on PATH (kubectl/AKS access is needed transitively via tenant-admin.sh).
#   - FLUID_DIR environment variable set to a FluidFramework checkout with dependencies already
#     installed and built (this script does not build FluidFramework).
#
# Usage:
#   FLUID_DIR=/path/to/FluidFramework azure/end-to-end-tests/end-to-end-tests.sh
set -euo pipefail

# Resolve repository-relative paths and select the default test parameters.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELFHOST_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PARAMETERS_FILE="$SCRIPT_DIR/end-to-end-tests.parameters.json"

[ "$#" -eq 0 ] || { echo "ERROR: this script does not accept arguments." >&2; exit 1; }

# Confirm the command-line tools and parameters file needed before authenticating.
for tool in az jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: required tool '$tool' not found." >&2; exit 1; }
done

[ -f "$PARAMETERS_FILE" ] || { echo "ERROR: parameters file not found: $PARAMETERS_FILE" >&2; exit 1; }

# Locate the already built FluidFramework end-to-end test package.
: "${FLUID_DIR:?ERROR: FLUID_DIR must be set to a local FluidFramework checkout}"
E2E_TEST_DIR="$FLUID_DIR/packages/test/test-end-to-end-tests"
[ -f "$E2E_TEST_DIR/package.json" ] || {
  echo "ERROR: $E2E_TEST_DIR/package.json not found -- FLUID_DIR does not look like a" >&2
  echo "       FluidFramework checkout with the test-end-to-end-tests package present." >&2
  exit 1
}

# Read the target deployment and optional manual credential values from the parameters file.
jqr() { jq -r "$1 // empty" "$PARAMETERS_FILE"; }
SUB="$(jqr '.subscriptionId')"
RG="$(jqr '.resourceGroup')"
AKS="$(jqr '.aksName')"
AFD="$(jqr '.frontDoorProfileName')"
TENANT_ID="$(jqr '.tenantId')"; TENANT_ID="${TENANT_ID:-fluid}"

if [ -z "$RG" ]; then
  echo "ERROR: 'resourceGroup' is required in $PARAMETERS_FILE." >&2
  exit 1
fi
if [ -z "$AKS" ]; then
  echo "ERROR: 'aksName' is required in $PARAMETERS_FILE." >&2
  exit 1
fi
if [ -z "$AFD" ]; then
  echo "ERROR: 'frontDoorProfileName' is required in $PARAMETERS_FILE." >&2
  exit 1
fi

# Initialize values populated by Azure authentication and discovery.
ALFRED_HOST=""
NEXUS_HOST=""
HISTORIAN_HOST=""
TENANT_SECRET=""

# Interactive Azure authentication and deployment discovery.
# Uses tenant-admin.sh to retrieve a tenant key for the specified tenantId.
try_interactive_auth() {
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

# Obtain the target endpoint and tenant credentials before running the test suite.
try_interactive_auth

# Test configuration
export fluid__test__driver__custom
fluid__test__driver__custom="$(jq -n \
  --arg tenantId "$TENANT_ID" \
  --arg tenantSecret "$TENANT_SECRET" \
  --arg host "https://$ALFRED_HOST" \
  --arg ordererUrl "https://$ALFRED_HOST" \
  --arg deltaStorageUrl "https://$HISTORIAN_HOST" \
  --arg deltaStreamUrl "https://$NEXUS_HOST" \
  '{tenantId: $tenantId, tenantSecret: $tenantSecret, host: $host, ordererUrl: $ordererUrl, deltaStorageUrl: $deltaStorageUrl, deltaStreamUrl: $deltaStreamUrl}')"


# Run the FluidFramework real-service tests
cd "$E2E_TEST_DIR"

export fluid__test__driver=r11s
export fluid__test__r11sEndpointName=custom

npm run test:realsvc:run -- \
  --driver=r11s \
  --r11sEndpointName=custom \
  --timeout=20s