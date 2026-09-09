#!/usr/bin/env bash
# deploy-validate/deploy-validate.sh -- post-deployment validation for the self-hosted Fluid
# stack. Runs VALIDATION.md's two-client scenario against a live azure/deploy.sh deployment.
# See README.md for prerequisites and usage.
set -euo pipefail

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELFHOST_ROOT="$(cd "$CLI_DIR/.." && pwd)"
PARAMS_FILE="$SELFHOST_ROOT/azure/deploy.parameters.json"
CONFIG_FILE="$CLI_DIR/.deployment-config.json"
USE_TOKEN_SERVICE=false
TENANT_ID_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --params)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "ERROR: --params requires a file path." >&2
        exit 1
      }
      PARAMS_FILE="$2"
      shift 2
      ;;
    --params=*) PARAMS_FILE="${1#*=}"; shift ;;
    --tenant)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "ERROR: --tenant requires a tenant ID." >&2
        exit 1
      }
      TENANT_ID_OVERRIDE="$2"
      shift 2
      ;;
    --tenant=*)
      TENANT_ID_OVERRIDE="${1#*=}"
      [[ -n "$TENANT_ID_OVERRIDE" ]] || {
        echo "ERROR: --tenant requires a tenant ID." >&2
        exit 1
      }
      shift
      ;;
    --token-service) USE_TOKEN_SERVICE=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$PARAMS_FILE" ]]; then
  echo "ERROR: parameters file not found: $PARAMS_FILE" >&2
  exit 1
fi

RG="$(jq -r '.resourceGroup' "$PARAMS_FILE")"
AFD="$(jq -r '.frontDoor.profileName' "$PARAMS_FILE")"
TENANT_ID="${TENANT_ID_OVERRIDE:-fluid}"
TOKEN_SERVICE_URL=""
APP_ID=""
APP_ID_URI=""
TOKEN_SCOPE=""
SERVICE_PRINCIPAL_OBJECT_ID=""
AZURE_APP_REGISTRATIONS_URL="https://ms.portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"

print_app_registration_help() {
  echo "Re-check tools/selfhost/token-service/README.md and confirm the App Registration exists," >&2
  echo "exposes Fluid.Token.Issue, is bound to Easy Auth, and authorizes Microsoft Azure CLI." >&2
  echo "App registrations: $AZURE_APP_REGISTRATIONS_URL" >&2
}

if [[ "$USE_TOKEN_SERVICE" == true ]]; then
  TOKEN_SERVICE_RG="$(jq -r '.tokenService.resourceGroup // empty' "$PARAMS_FILE")"
  TOKEN_SERVICE_RG="${TOKEN_SERVICE_RG:-$RG}"
  TOKEN_SERVICE_APP="$(jq -r '.tokenService.functionAppName // empty' "$PARAMS_FILE")"
  if [[ -z "$TENANT_ID_OVERRIDE" ]]; then
    TENANT_ID="$(jq -r '.tokenService.tenantId // "fluid"' "$PARAMS_FILE")"
  fi
  [[ -n "$TOKEN_SERVICE_APP" ]] || {
    echo "ERROR: tokenService.functionAppName is required for --token-service." >&2
    exit 1
  }
  if ! TOKEN_SERVICE_ID="$(az functionapp show -g "$TOKEN_SERVICE_RG" -n "$TOKEN_SERVICE_APP" \
    --query id -o tsv 2>/dev/null)"; then
    echo "ERROR: Function App '$TOKEN_SERVICE_APP' does not exist or is not accessible in resource group '$TOKEN_SERVICE_RG'." >&2
    print_app_registration_help
    exit 1
  fi
  [[ -n "$TOKEN_SERVICE_ID" ]] || {
    echo "ERROR: could not resolve Function App '$TOKEN_SERVICE_APP'." >&2
    print_app_registration_help
    exit 1
  }
  if ! TOKEN_SERVICE_HOST="$(az resource show --ids "$TOKEN_SERVICE_ID" \
    --api-version 2023-12-01 --query properties.defaultHostName -o tsv 2>/dev/null)"; then
    echo "ERROR: could not read Function App '$TOKEN_SERVICE_APP' through ARM." >&2
    print_app_registration_help
    exit 1
  fi
  [[ -n "$TOKEN_SERVICE_HOST" ]] || {
    echo "ERROR: Function App '$TOKEN_SERVICE_APP' has no default hostname." >&2
    exit 1
  }
  TOKEN_SERVICE_URL="https://$TOKEN_SERVICE_HOST/api/token"

  APP_ID="$(jq -r '.tokenService.appRegistrationId // empty' "$PARAMS_FILE")"
  APP_ID_URI="$(jq -r '.tokenService.appIdUri // empty' "$PARAMS_FILE")"
  SERVICE_PRINCIPAL_OBJECT_ID="$(jq -r \
    '.tokenService.servicePrincipalObjectId // empty' "$PARAMS_FILE")"
  SUBSCRIPTION_ID="$(jq -r '.subscriptionId' "$PARAMS_FILE")"
  AUTH_URL="https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$TOKEN_SERVICE_RG/providers/Microsoft.Web/sites/$TOKEN_SERVICE_APP/config/authsettingsV2?api-version=2023-12-01"
  if ! AUTH_APP_ID="$(az rest --method GET --url "$AUTH_URL" \
    --query properties.identityProviders.azureActiveDirectory.registration.clientId \
    -o tsv 2>/dev/null)"; then
    echo "ERROR: could not read Easy Auth configuration from '$TOKEN_SERVICE_APP'." >&2
    print_app_registration_help
    exit 1
  fi
  if [[ -z "$APP_ID" ]]; then
    APP_ID="$AUTH_APP_ID"
  elif [[ -n "$AUTH_APP_ID" && "$AUTH_APP_ID" != "$APP_ID" ]]; then
    echo "ERROR: deploy.parameters.json names App Registration '$APP_ID', but Easy Auth uses '$AUTH_APP_ID'." >&2
    print_app_registration_help
    exit 1
  fi
  [[ -n "$APP_ID" ]] || {
    echo "ERROR: could not determine the token service App Registration client ID." >&2
    print_app_registration_help
    exit 1
  }
  APP_ID_URI="${APP_ID_URI:-api://$APP_ID}"
  TOKEN_SCOPE="$APP_ID_URI/Fluid.Token.Issue"
fi

echo "Discovering Front Door endpoints for profile '$AFD' in resource group '$RG'..."
ALFRED_HOST="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "alfred-$AFD" --query hostName -o tsv)"
NEXUS_HOST="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "nexus-$AFD" --query hostName -o tsv)"
HISTORIAN_HOST="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "historian-$AFD" --query hostName -o tsv)"

jq -n \
  --arg tenantId "$TENANT_ID" \
  --arg alfred "https://$ALFRED_HOST" \
  --arg nexus "wss://$NEXUS_HOST" \
  --arg historian "https://$HISTORIAN_HOST" \
  --arg tokenServiceUrl "$TOKEN_SERVICE_URL" \
  --arg tokenServiceAppId "$APP_ID" \
  --arg servicePrincipalObjectId "$SERVICE_PRINCIPAL_OBJECT_ID" \
  --argjson useTokenService "$USE_TOKEN_SERVICE" \
  '{
    tenantId: $tenantId,
    endpoints: {alfred: $alfred, nexus: $nexus, historian: $historian}
  } + if $useTokenService then {
    tokenService: {
      url: $tokenServiceUrl,
      appId: $tokenServiceAppId,
      servicePrincipalObjectId: $servicePrincipalObjectId
    }
  } else {} end' \
  > "$CONFIG_FILE"

echo ""
echo "Deployment config written to $CONFIG_FILE:"
cat "$CONFIG_FILE"
echo ""

read -r -p "Run validation tests now against this deployment? [y/N] " REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Skipped. Re-run this script later to run the tests -- the config file above is reused."
  exit 0
fi

if [[ "$USE_TOKEN_SERVICE" == true ]]; then
  ENTRA_TENANT_ID="$(az account show --query tenantId -o tsv)"

  echo "Acquiring an Entra token for $TOKEN_SCOPE..."
  if [[ -z "${DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN:-}" ]]; then
    if ! DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN="$(az account get-access-token \
      --tenant "$ENTRA_TENANT_ID" --scope "$TOKEN_SCOPE" --query accessToken -o tsv 2>/dev/null)"; then
      echo "The current Azure CLI login has not consented to the token-service scope."
      echo "Starting an interactive scoped sign-in..."
      if ! az login --tenant "$ENTRA_TENANT_ID" --scope "$TOKEN_SCOPE" >/dev/null; then
        echo "ERROR: scoped Azure sign-in failed. The App Registration, scope, authorized client, or tenant consent setup is invalid." >&2
        print_app_registration_help
        echo "After correcting it, sign in manually and retry:" >&2
        echo "  az login --tenant $ENTRA_TENANT_ID --scope $TOKEN_SCOPE" >&2
        exit 1
      fi
      if ! DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN="$(az account get-access-token \
        --tenant "$ENTRA_TENANT_ID" --scope "$TOKEN_SCOPE" --query accessToken -o tsv)"; then
        echo "ERROR: scoped Azure sign-in succeeded but no access token could be acquired." >&2
        print_app_registration_help
        exit 1
      fi
    fi
  fi
  [[ -n "$DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN" ]] || {
    echo "ERROR: Azure CLI returned an empty Entra access token." >&2
    exit 1
  }
  export DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN
else
  echo "Fetching tenant key for '$TENANT_ID' via tenant-admin..."
  FLUID_TENANT_KEY="$("$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMS_FILE" \
    get-key "$TENANT_ID" | jq -r '.key1')"
  export FLUID_TENANT_KEY
fi

if [[ ! -d "$CLI_DIR/node_modules" ]]; then
  echo "node_modules not found -- running npm install in $CLI_DIR..."
  (cd "$CLI_DIR" && npm install)
fi

node "$CLI_DIR/bin/deploy-validate.js" "$CONFIG_FILE"
