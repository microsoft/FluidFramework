#!/usr/bin/env bash
# token-service/deploy-token-service.sh — deploy the reference token service.
#
# Creates the Entra App Registration, Function App, and Easy Auth configuration that turn
# this directory into a working token endpoint, then verifies that an unauthenticated request
# is actually rejected.
#
# What this creates (all in the same resource group as the Fluid deployment):
#   - An Entra ID App Registration exposing a `Fluid.Token.Issue` scope. This is the audience
#     Easy Auth validates against and the scope clients request.
#   - A Storage Account, which the Functions runtime requires.
#   - A Linux Consumption Function App running Node 20 with a system-assigned managed identity.
#   - A Key Vault secret holding the Fluid tenant key, read by the Function App through a Key
#     Vault reference so the key is never stored in application configuration.
#   - Easy Auth, configured to reject unauthenticated callers with 401 rather than redirect
#     them to a login page, which is the correct behaviour for an API.
#   - Platform-level CORS for any browser origins you list, so preflight requests are answered
#     by App Service before Easy Auth runs.
#
# Prerequisites:
#   - The Fluid stack is already deployed (azure/deploy.sh) and its tenant exists.
#   - `az` logged in to the target subscription, plus `jq`.
#   - Permission to create App Registrations in the directory (Application Developer or
#     Application.ReadWrite.All). This is a directory-level permission that subscription
#     Owner does not include, so it is checked up front rather than failing halfway through.
#
# Re-running is safe: every step checks for an existing resource first.
#
# Usage: token-service/deploy-token-service.sh [path/to/deploy.parameters.json]
set -euo pipefail

SELFHOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$SELFHOST_ROOT/token-service"
PARAMS_FILE="${1:-$SELFHOST_ROOT/azure/deploy.parameters.json}"

log()    { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
banner() { printf '\n=== %s ===\n' "$*"; }
fail()   { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$PARAMS_FILE" ]] || fail "parameters file not found: $PARAMS_FILE"
command -v az >/dev/null || fail "az CLI not found."
command -v jq >/dev/null || fail "jq not found."

# Every `az webapp auth ...` command in this script comes from the authV2 CLI extension, not from
# the core CLI. When it is missing, az offers to install it -- and that prompt is written to
# STDERR, which several calls here redirect to /dev/null. The prompt is therefore invisible while
# az sits waiting on stdin, so the script looks frozen partway through with no error and no
# further output. Whether it happens at all depends on the operator's own
# `extension.use_dynamic_install` setting (`yes_without_prompt` installs silently, the default
# `yes_prompt` blocks), which is why this reproduces on one machine and not another.
#
# Installing it up front removes the prompt entirely, and does so with output the operator can
# see. --yes covers the older CLI versions that prompt on install too.
ensure_az_extension() {
  local ext="$1"
  if az extension show --name "$ext" >/dev/null 2>&1; then
    return 0
  fi
  log "Installing the '$ext' az CLI extension (required for Easy Auth configuration)"
  az extension add --name "$ext" --yes >/dev/null 2>&1 </dev/null \
    || fail "Could not install the '$ext' az CLI extension. Install it manually and re-run:
  az extension add --name $ext"
}
ensure_az_extension authV2

# Belt and braces: if a future change adds another extension-backed az command without extending
# the preflight above, this keeps it from resurrecting the silent hang. It only affects this
# script's own process, never the operator's az configuration.
export AZURE_EXTENSION_USE_DYNAMIC_INSTALL=yes_without_prompt

p() { jq -r "$1 // empty" "$PARAMS_FILE"; }

SUB="$(p .subscriptionId)"
RG="$(p .resourceGroup)"
LOC="$(p .location)"
KV="$(p .keyVault.name)"

[[ -n "$SUB" && -n "$RG" && -n "$LOC" && -n "$KV" ]] ||
  fail "subscriptionId, resourceGroup, location, and keyVault.name are all required in $PARAMS_FILE."

FUNC_APP="$(p .tokenService.functionAppName)"
FUNC_STORAGE="$(p .tokenService.storageAccountName)"
APP_REG_NAME="$(p .tokenService.appRegistrationName)"
APP_REG_ID="$(p .tokenService.appRegistrationId)"
APP_ID_URI_PARAM="$(p .tokenService.appIdUri)"
APP_SP_OBJECT_ID_PARAM="$(p .tokenService.servicePrincipalObjectId)"
FLUID_TENANT="$(p .tokenService.tenantId)"
LIFETIME="$(p .tokenService.tokenLifetimeSec)"
NODE_VERSION="$(p .tokenService.nodeVersion)"

[[ -n "$FUNC_APP" ]]     || fail "tokenService.functionAppName is required in $PARAMS_FILE."
[[ -n "$FUNC_STORAGE" ]] || fail "tokenService.storageAccountName is required in $PARAMS_FILE."
APP_REG_NAME="${APP_REG_NAME:-$FUNC_APP}"
FLUID_TENANT="${FLUID_TENANT:-fluid}"
LIFETIME="${LIFETIME:-3600}"

# Azure will not put a Linux Consumption plan in a resource group that already holds any other
# App Service plan -- consumption runs on dedicated stamps, and the group is bound to one kind.
# The symptom is not a clear error but "Cannot acquire exclusive lock" or a GatewayTimeout on
# create. A separate resource group sidesteps it, and keeps the token service's lifecycle
# independent of the cluster's. Defaults to the main group, which is fine when nothing else
# there uses App Service.
FUNC_RG="$(p .tokenService.resourceGroup)"
FUNC_RG="${FUNC_RG:-$RG}"

# The Function App has to sit in the same region as the Key Vault it reads its tenant keys from.
# A vault with public network access disabled is reachable only over its private endpoint, which
# means joining that VNet, and VNet integration is regional -- an app in another region cannot
# join at all. Defaulting to the parameters file's `location` puts the app in the wrong region
# whenever the cluster (and therefore the vault) was placed elsewhere via aks.location, so the
# vault's own region is used instead.
FUNC_LOC="$(p .tokenService.location)"
if [[ -z "$FUNC_LOC" ]]; then
  FUNC_LOC="$(az keyvault show -g "$RG" -n "$KV" --query location -o tsv 2>/dev/null || true)"
fi
FUNC_LOC="${FUNC_LOC:-$LOC}"

# VNet integration inputs, only used when the vault is private-endpoint-only.
VNET_NAME="$(p .tokenService.vnetName)"
if [[ -z "$VNET_NAME" ]]; then
  VNET_NAME="$(az network vnet list -g "$RG" --query "[0].name" -o tsv 2>/dev/null || true)"
fi
FUNC_SUBNET="$(p .tokenService.subnetName)"; FUNC_SUBNET="${FUNC_SUBNET:-func-subnet}"
FUNC_SUBNET_PREFIX="$(p .tokenService.subnetPrefix)"; FUNC_SUBNET_PREFIX="${FUNC_SUBNET_PREFIX:-10.20.3.0/24}"
# Azure rejects `functionapp create` on an end-of-life Node version outright, so this needs
# bumping as releases age out. `az functionapp list-runtimes --os linux` lists what is accepted.
NODE_VERSION="${NODE_VERSION:-24}"

# Which issuer Easy Auth expects in a token's `iss`. This has to match the token version the
# App Registration issues, which is its requestedAccessTokenVersion: 2 gives v2 tokens, null or
# 1 gives v1. A registration created by this script is v2; one created in the portal is often
# v1. A mismatch is refused by the platform with a bodiless 403 after a completely successful
# sign-in, which looks nothing like an issuer problem, so it is worth setting deliberately.
# Which shipped authorization policy the service applies. "default" grants every authenticated
# user access to every served tenant; "tenant-scoped" requires a Fluid.<tenantId>.Writer or
# .Reader app role per tenant; "role-based" uses service-wide FluidCollaborator/FluidReader.
AUTH_POLICY="$(p .tokenService.authorizationPolicy)"
AUTH_POLICY="${AUTH_POLICY:-default}"
case "$AUTH_POLICY" in
  default|tenant-scoped|role-based) ;;
  *) fail "tokenService.authorizationPolicy must be default, tenant-scoped or role-based, got '$AUTH_POLICY'." ;;
esac

TOKEN_ISSUER_VERSION="$(p .tokenService.tokenIssuerVersion)"
# Remembered so the Graph path below can tell "operator chose this" from "defaulted". When it was
# defaulted, the registration's real requestedAccessTokenVersion wins; when it was set
# explicitly, a disagreement is an error rather than something to silently override.
TOKEN_ISSUER_VERSION_EXPLICIT="$TOKEN_ISSUER_VERSION"
TOKEN_ISSUER_VERSION="${TOKEN_ISSUER_VERSION:-v2}"
case "$TOKEN_ISSUER_VERSION" in
  v1|v2) ;;
  *) fail "tokenService.tokenIssuerVersion must be 'v1' or 'v2', got '$TOKEN_ISSUER_VERSION'." ;;
esac

# Which hosting model the Function App runs on.
#   flex        - Flex Consumption. Serverless like Consumption, but on newer infrastructure
#                 that does not use the shared Linux Consumption stamps, and it supports VNet
#                 integration. The default.
#   consumption - classic Linux Consumption (Y1). Cheapest, but its stamps cannot share a
#                 resource group with any other App Service plan, and in tightly policy-governed
#                 subscriptions the host can fail to start in ways nothing here can inspect.
HOSTING_PLAN="$(p .tokenService.hostingPlan)"
HOSTING_PLAN="${HOSTING_PLAN:-flex}"
case "$HOSTING_PLAN" in
  flex|consumption) ;;
  *) fail "tokenService.hostingPlan must be 'flex' or 'consumption', got '$HOSTING_PLAN'." ;;
esac

# Every tenant this service signs for needs its own key, so they are provisioned together.
# The default tenant is always first; additionalTenants extends the list.
TENANTS=("$FLUID_TENANT")
while IFS= read -r extra; do
  [[ -n "$extra" && "$extra" != "$FLUID_TENANT" ]] && TENANTS+=("$extra")
done < <(jq -r '.tokenService.additionalTenants // [] | .[]' "$PARAMS_FILE")

# The secret name is per-tenant so one tenant's key can be rotated without touching another's.
kv_secret_name() { printf 'fluid-tenant-key-%s' "$1"; }

# Tenant ids are lowercase letters, digits and dashes, so uppercasing and swapping dashes for
# underscores cannot make two tenants collide on one setting name. Mirrors src/config.js.
key_setting_name() {
  printf 'FLUID_TENANT_KEY_%s' "$(printf '%s' "$1" | tr '[:lower:]-' '[:upper:]_')"
}

SCOPE_NAME="Fluid.Token.Issue"

app_role_create_url() {
  printf 'https://ms.portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/AppRoles/appId/%s/isMSAApp~/false' "$APP_ID"
}

app_role_assign_url() {
  if [[ -n "${APP_SERVICE_PRINCIPAL_ID:-}" ]]; then
    printf 'https://ms.portal.azure.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Users/objectId/%s/appId/%s' \
      "$APP_SERVICE_PRINCIPAL_ID" "$APP_ID"
  else
    printf 'https://ms.portal.azure.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview'
  fi
}

log_app_role_links() {
  log "App roles:       $(app_role_create_url)"
  log "Role assignment: $(app_role_assign_url)"
  if [[ -z "${APP_SERVICE_PRINCIPAL_ID:-}" ]]; then
    log "  Set tokenService.servicePrincipalObjectId for a direct assignment link."
  fi
}

az account set --subscription "$SUB"
ENTRA_TENANT_ID="$(az account show --query tenantId -o tsv)"


# Every write to a site can collide with an Azure Policy deployIfNotExists remediation holding
# that site's lock, which surfaces as a 429 "Cannot acquire exclusive lock" or a gateway
# timeout. These are transient by nature -- the remediation finishes -- so site writes are
# retried rather than treated as failures. Anything else fails immediately.
site_write() {
  local desc="$1"; shift
  local err="${TMPDIR:-/tmp}/tokensvc-write.$$" attempt
  for attempt in 1 2 3 4; do
    if "$@" >/dev/null 2>"$err"; then
      rm -f "$err"
      return 0
    fi
    if ! grep -qiE "exclusive lock|GatewayTimeout|429|Conflict" "$err" || [[ $attempt -eq 4 ]]; then
      cat "$err" >&2
      rm -f "$err"
      fail "$desc failed."
    fi
    log "  $desc: site is locked, retrying in $((attempt * 15))s..."
    sleep $((attempt * 15))
  done
}


# Resolves the caller's AAD object id from an ARM access token's `oid` claim. The obvious
# `az ad signed-in-user show` is a Microsoft Graph call, which this directory may block; ARM
# token issuance is unaffected. Mirrors azure/deploy.sh.
current_principal_object_id() {
  local token payload
  token="$(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv)"
  payload="$(cut -d '.' -f2 <<<"$token" | tr '_-' '/+')"
  case $(( ${#payload} % 4 )) in
    2) payload+="==" ;;
    3) payload+="=" ;;
  esac
  base64 -d <<<"$payload" 2>/dev/null | jq -r '.oid'
}

# Filters on role definition AND exact scope, not just principal: assignments inherited from
# ancestor scopes also appear here, and subscription Owner does not imply Key Vault data-plane
# access -- Owner's Actions:["*"] excludes DataActions. Mirrors azure/deploy.sh.
ensure_role_assignment() {
  local principal_object_id="$1" principal_type="$2" role_name="$3" scope="$4"
  local role_def_id existing
  LAST_CREATED_ROLE_ID=""
  role_def_id="$(az role definition list --name "$role_name" --query '[0].name' -o tsv)"
  existing="$(az rest --method get \
    --url "https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01" \
    --query "value[?properties.principalId=='$principal_object_id' && contains(properties.roleDefinitionId, '$role_def_id') && properties.scope=='$scope'].id | [0]" -o tsv 2>/dev/null)"
  if [[ -n "$existing" ]]; then
    log "Role '$role_name' already granted at this scope"
  else
    LAST_CREATED_ROLE_ID="$(az role assignment create --assignee-object-id "$principal_object_id" \
      --assignee-principal-type "$principal_type" --role "$role_name" --scope "$scope" \
      --query id -o tsv)"
  fi
}

TEMP_ROLE_ASSIGNMENT_IDS=()
KV_PUBLIC_ACCESS_ORIGINAL=""

restore_keyvault_public_access() {
  [[ -n "$KV_PUBLIC_ACCESS_ORIGINAL" ]] || return 0
  log "Restoring public network access on $KV to $KV_PUBLIC_ACCESS_ORIGINAL"
  az keyvault update -g "$RG" -n "$KV" \
    --public-network-access "$KV_PUBLIC_ACCESS_ORIGINAL" >/dev/null
  KV_PUBLIC_ACCESS_ORIGINAL=""
}

cleanup_temporary_role_assignments() {
  local id
  for id in "${TEMP_ROLE_ASSIGNMENT_IDS[@]}"; do
    [[ -n "$id" ]] || continue
    log "Removing temporary Key Vault role assignment"
    az rest --method delete \
      --url "https://management.azure.com${id}?api-version=2022-04-01" >/dev/null 2>&1 || true
  done
}

cleanup_deployment_state() {
  restore_keyvault_public_access || true
  cleanup_temporary_role_assignments
}
trap cleanup_deployment_state EXIT

# A fresh role assignment takes a minute or two to reach the data plane, so Forbidden right
# after granting one is usually propagation rather than a real denial.
keyvault_secret_set_with_retry() {
  local vault="$1" name="$2" value="$3" attempt err="${TMPDIR:-/tmp}/tokensvc-kv.$$"
  for attempt in 1 2 3 4 5 6; do
    if az keyvault secret set --vault-name "$vault" --name "$name" --value "$value" >/dev/null 2>"$err"; then
      rm -f "$err"; return 0
    fi
    if grep -q "Public network access is disabled" "$err" 2>/dev/null; then
      cat "$err" >&2; rm -f "$err"
      fail "Key Vault $vault is unreachable: public network access is disabled and this machine
is outside its VNet. phase_tenant_key should have enabled it temporarily for this workstation
write; confirm the update was not blocked by Azure Policy."
    fi
    if ! grep -qi "Forbidden\|ForbiddenByRbac" "$err" 2>/dev/null || [[ $attempt -eq 6 ]]; then
      cat "$err" >&2; rm -f "$err"
      fail "Could not write secret '$name' to Key Vault $vault."
    fi
    log "  waiting for the role assignment to propagate (attempt $attempt)..."
    sleep 15
  done
}

# ---------------------------------------------------------------------------
# App Registration
# ---------------------------------------------------------------------------
phase_app_registration() {
  banner "App Registration"

  # Some directories block Microsoft Graph for the Azure CLI entirely, via a conditional access
  # token protection policy. The CLI cannot satisfy token binding, so no `az login` gets around
  # it and every `az ad ...` call fails, reads included. Naming an already-created registration
  # skips Graph completely; everything else this script does runs against ARM, which is
  # unaffected.
  if [[ -n "$APP_REG_ID" ]]; then
    APP_ID="$APP_REG_ID"
    APP_ID_URI="${APP_ID_URI_PARAM:-api://$APP_ID}"
    APP_SERVICE_PRINCIPAL_ID="$APP_SP_OBJECT_ID_PARAM"
    log "Using pre-created App Registration $APP_ID"
    log "Skipping all Microsoft Graph calls. Confirm in the portal that it has:"
    log "  - Application ID URI:  $APP_ID_URI"
    log "  - Exposed scope:       $SCOPE_NAME"
    log "  - SPA redirect URIs for any browser client"
    log_app_role_links
    return 0
  fi

  # Fail on the first Graph call rather than partway through, so a blocked directory is
  # reported once with the way forward instead of as a create error.
  local probe_err="${TMPDIR:-/tmp}/tokensvc-graphprobe.$$"
  if ! az ad app list --display-name "$APP_REG_NAME" --query "[0].appId" -o tsv >/dev/null 2>"$probe_err"; then
    if grep -q "AADSTS530084\|AADSTS50076\|AADSTS50079" "$probe_err"; then
      cat "$probe_err" >&2
      rm -f "$probe_err"
      fail "Microsoft Graph is blocked for the Azure CLI in this directory by a conditional access
token protection policy. The CLI cannot satisfy token binding, so re-running 'az login' will not
help -- every 'az ad ...' command fails, including read-only ones.

Create the App Registration in the Azure portal instead (a browser session on a compliant device
does satisfy the policy), then put its Application (client) ID in your parameters file:

  \"tokenService\": { \"appRegistrationId\": \"<application client id>\" }

This script then skips Microsoft Graph entirely. token-service/README.md lists what to configure
on the registration. Everything else here uses ARM, which this policy does not affect."
    fi
    rm -f "$probe_err"
  fi
  rm -f "$probe_err"

  APP_ID="$(az ad app list --display-name "$APP_REG_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)"

  if [[ -n "$APP_ID" ]]; then
    log "App Registration '$APP_REG_NAME' already exists ($APP_ID)"
  else
    log "Creating App Registration '$APP_REG_NAME'"
    # AzureADMyOrg confines sign-in to this directory. A multi-tenant registration would let
    # any Entra account in the world authenticate, leaving the tenant check in identity.js as
    # the only thing standing between an outsider and a token.
    local create_err="${TMPDIR:-/tmp}/tokensvc-appcreate.$$"
    if ! APP_ID="$(az ad app create \
      --display-name "$APP_REG_NAME" \
      --sign-in-audience AzureADMyOrg \
      --query appId -o tsv 2>"$create_err")"; then
      cat "$create_err" >&2
      if grep -q "AADSTS530084\|AADSTS50076\|AADSTS50079" "$create_err"; then
        # Conditional access on the Microsoft Graph token, not a permissions problem. The CLI's
        # cached Graph token predates the policy and has to be reacquired interactively.
        rm -f "$create_err"
        fail "Microsoft Graph rejected the CLI's token under a conditional access policy. This is
not a missing role. Re-authenticate for Graph, then re-run this script:

  az login --tenant $ENTRA_TENANT_ID --scope https://graph.microsoft.com//.default

If your directory blocks app registration creation outright, ask an administrator to create one
and set tokenService.appRegistrationName to its display name -- this script reuses an existing
registration by name."
      fi
      rm -f "$create_err"
      fail "Could not create the App Registration. Creating one needs the directory-level
Application Developer role, which subscription Owner does not grant. Either obtain that role, or
ask an administrator to create the registration and set tokenService.appRegistrationName to its
display name -- this script reuses an existing registration by name."
    fi
    rm -f "$create_err"
    log "Created App Registration $APP_ID"

    # az ad app create leaves api.requestedAccessTokenVersion null, which means the registration
    # issues v1 access tokens (iss https://sts.windows.net/<tid>/). Easy Auth is configured below
    # with the v2 issuer by default, and the mismatch is refused by the platform with a BODILESS
    # 403 after a completely successful sign-in -- a symptom that looks nothing like an issuer
    # problem and is genuinely hard to diagnose. Set it explicitly while `api` is still empty:
    # PATCH replaces the whole `api` object, so doing this before the scope is added below is
    # what keeps it from clobbering oauth2PermissionScopes.
    log "Setting requestedAccessTokenVersion=2 on the new registration"
    az rest --method PATCH \
      --uri "https://graph.microsoft.com/v1.0/applications(appId='$APP_ID')" \
      --headers "Content-Type=application/json" \
      --body '{"api":{"requestedAccessTokenVersion":2}}' >/dev/null \
      || fail "Could not set requestedAccessTokenVersion on $APP_ID. Set it to 2 in the portal
(App registrations > Manifest), or set tokenService.tokenIssuerVersion to v1 to match a v1
registration."
  fi

  APP_OBJECT_ID="$(az ad app show --id "$APP_ID" --query id -o tsv)"
  APP_SERVICE_PRINCIPAL_ID="$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || true)"
  if [[ -z "$APP_SERVICE_PRINCIPAL_ID" ]]; then
    log "Creating the Enterprise Application for role assignments (best effort)"
    APP_SERVICE_PRINCIPAL_ID="$(az ad sp create --id "$APP_ID" \
      --query id -o tsv 2>/dev/null || true)"
  fi
  log_app_role_links

  # Align the Easy Auth issuer with what the registration actually issues, rather than trusting
  # tokenService.tokenIssuerVersion to have been set correctly. Getting this pair wrong produces
  # a bodiless 403 after a successful sign-in, so reading the truth here removes a whole class of
  # misconfiguration -- particularly for a registration created in the portal, which is commonly
  # v1. An explicit tokenIssuerVersion in the parameters file still wins, since a registration
  # can be changed out from under this script.
  local actual_token_version detected
  actual_token_version="$(az ad app show --id "$APP_ID" \
    --query "api.requestedAccessTokenVersion" -o tsv 2>/dev/null || true)"
  case "$actual_token_version" in
    2) detected="v2" ;;
    1|None|null|"") detected="v1" ;;
    *) detected="" ;;
  esac
  if [[ -n "$detected" ]]; then
    if [[ -z "$TOKEN_ISSUER_VERSION_EXPLICIT" ]]; then
      if [[ "$detected" != "$TOKEN_ISSUER_VERSION" ]]; then
        log "App Registration issues $detected tokens; using the $detected issuer for Easy Auth"
        TOKEN_ISSUER_VERSION="$detected"
      fi
    elif [[ "$detected" != "$TOKEN_ISSUER_VERSION" ]]; then
      fail "tokenService.tokenIssuerVersion is '$TOKEN_ISSUER_VERSION' but App Registration $APP_ID
issues $detected access tokens (api.requestedAccessTokenVersion=${actual_token_version:-null}).
Easy Auth would reject every token with a bodiless 403 after a successful sign-in. Either set
tokenIssuerVersion to '$detected', or change the registration's manifest to match."
    fi
  fi

  # Clients request `<identifierUri>/Fluid.Token.Issue`, so the app needs an identifier URI and
  # a matching exposed scope. An existing registration usually already has one, and overwriting
  # it would break whatever relies on it, so it is only set when absent.
  APP_ID_URI="$(az ad app show --id "$APP_ID" --query "identifierUris[0]" -o tsv 2>/dev/null || true)"
  if [[ -z "$APP_ID_URI" ]]; then
    APP_ID_URI="api://$APP_ID"
    log "Setting identifier URI $APP_ID_URI"
    az ad app update --id "$APP_ID" --identifier-uris "$APP_ID_URI"
  else
    log "Using existing identifier URI $APP_ID_URI"
  fi

  local existing_scope
  existing_scope="$(az ad app show --id "$APP_ID" \
    --query "api.oauth2PermissionScopes[?value=='$SCOPE_NAME'] | [0].id" -o tsv 2>/dev/null || true)"

  if [[ -n "$existing_scope" ]]; then
    log "Scope $SCOPE_NAME already exposed"
  else
    log "Exposing scope $SCOPE_NAME"
    # Written through Graph directly: `az ad app update` has no first-class flag for defining
    # an OAuth2 permission scope.
    #
    # Graph replaces the whole oauth2PermissionScopes array on write, so the existing scopes are
    # read back and the new one appended. Sending only the new scope would delete every other
    # scope the registration exposes and break its existing clients -- which matters because
    # this script is meant to be usable against a registration an administrator already made.
    local scope_id existing_scopes merged_scopes
    scope_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
    existing_scopes="$(az ad app show --id "$APP_ID" --query "api.oauth2PermissionScopes" -o json 2>/dev/null)"
    [[ -n "$existing_scopes" && "$existing_scopes" != "null" ]] || existing_scopes="[]"

    merged_scopes="$(jq -n --argjson existing "$existing_scopes" --arg id "$scope_id" --arg value "$SCOPE_NAME" '
      $existing + [{
        id: $id,
        value: $value,
        type: "User",
        isEnabled: true,
        adminConsentDisplayName: "Issue Fluid access tokens",
        adminConsentDescription: "Allows the signed-in user to obtain a Fluid access token.",
        userConsentDisplayName: "Issue Fluid access tokens",
        userConsentDescription: "Allows the app to obtain a Fluid access token on your behalf."
      }]')"

    local kept
    kept="$(jq 'length' <<<"$existing_scopes")"
    [[ "$kept" -gt 0 ]] && log "Preserving $kept existing scope(s) on this registration"

    az rest --method PATCH \
      --url "https://graph.microsoft.com/v1.0/applications/$APP_OBJECT_ID" \
      --headers "Content-Type=application/json" \
      --body "$(jq -n --argjson scopes "$merged_scopes" '{ api: { oauth2PermissionScopes: $scopes } }')"
  fi

  # A browser client authenticating with MSAL needs its origin registered as an SPA redirect
  # URI. Existing entries are merged rather than replaced: Graph PATCH overwrites the whole
  # array, so a re-run naming only a production origin would silently unregister the localhost
  # one someone was still testing against, and MSAL would fail with a redirect-mismatch error
  # nowhere near the cause.
  local wanted existing merged
  wanted="$(jq -r '.tokenService.spaRedirectUris // [] | .[]' "$PARAMS_FILE")"
  [[ -n "$wanted" ]] || return 0

  existing="$(az ad app show --id "$APP_ID" --query "spa.redirectUris[]" -o tsv 2>/dev/null || true)"
  merged="$(printf '%s\n%s\n' "$existing" "$wanted" | sed '/^$/d' | sort -u)"

  if [[ "$(printf '%s' "$merged" | sort -u)" == "$(printf '%s' "$existing" | sed '/^$/d' | sort -u)" ]]; then
    log "SPA redirect URIs already registered"
    return 0
  fi

  log "Registering SPA redirect URIs: $(printf '%s' "$merged" | tr '\n' ' ')"
  az rest --method PATCH \
    --url "https://graph.microsoft.com/v1.0/applications/$APP_OBJECT_ID" \
    --headers "Content-Type=application/json" \
    --body "$(jq -n --arg uris "$merged" '{ spa: { redirectUris: ($uris | split("\n")) } }')"
}

# ---------------------------------------------------------------------------
# Function App
# ---------------------------------------------------------------------------
phase_function_app() {
  banner "Function App"

  if [[ "$FUNC_RG" != "$RG" ]]; then
    if az group show -n "$FUNC_RG" >/dev/null 2>&1; then
      log "Using resource group $FUNC_RG for the Function App"
    else
      log "Creating resource group $FUNC_RG for the Function App"
      az group create -n "$FUNC_RG" -l "$FUNC_LOC" >/dev/null
    fi
  fi

  # A site with this name but the wrong shape -- typically the wreckage of an earlier failed
  # create, left as a Windows app on a Free plan -- is invisible to `functionapp show` and then
  # collides on create, surfacing as a lock or timeout rather than a name conflict.
  local existing_kind
  existing_kind="$(az webapp show -g "$FUNC_RG" -n "$FUNC_APP" --query kind -o tsv 2>/dev/null || true)"
  if [[ -n "$existing_kind" && "$existing_kind" != *functionapp* ]]; then
    fail "A site named '$FUNC_APP' already exists in $FUNC_RG but is not a function app (kind:
$existing_kind). It is most likely left over from an interrupted deploy. Delete it and its plan,
then re-run:

  az webapp delete -g $FUNC_RG -n $FUNC_APP
  az appservice plan list -g $FUNC_RG -o table    # remove any now-empty plan it used"
  fi

  if az storage account show -g "$FUNC_RG" -n "$FUNC_STORAGE" >/dev/null 2>&1; then
    log "Storage account $FUNC_STORAGE already exists"
  else
    log "Creating storage account $FUNC_STORAGE"
    az storage account create -g "$FUNC_RG" -n "$FUNC_STORAGE" -l "$FUNC_LOC" \
      --sku Standard_LRS --min-tls-version TLS1_2 --allow-blob-public-access false >/dev/null
  fi

  if az functionapp show -g "$FUNC_RG" -n "$FUNC_APP" >/dev/null 2>&1; then
    log "Function App $FUNC_APP already exists"
  else
    # Only classic Consumption is bound to a stamp shared with the whole resource group; Flex
    # has no such restriction, so this check would be wrong there.
    local foreign_plans=""
    [[ "$HOSTING_PLAN" == "consumption" ]] && foreign_plans="$(az appservice plan list -g "$FUNC_RG" \
      --query "[?sku.tier!='Dynamic'].{n:name,t:sku.tier}" -o tsv 2>/dev/null || true)"
    if [[ -n "$foreign_plans" ]]; then
      fail "Resource group $FUNC_RG already contains App Service plan(s):

  $foreign_plans

  Azure will not create a Linux Consumption function app alongside them -- consumption runs on
  dedicated stamps and a resource group is bound to one kind. Create attempts fail with 'Cannot
  acquire exclusive lock' or a GatewayTimeout rather than a clear message.

  Either remove those plans if they are unused, or point the token service at its own group:

    \"tokenService\": { \"resourceGroup\": \"$RG-tokensvc\" }

  The Function App reaches Key Vault in $RG by resource id, so a separate group changes nothing
  else."
    fi

    log "Creating Function App $FUNC_APP ($HOSTING_PLAN, $FUNC_LOC)"
    # The CLI's create is synchronous, but site creation here is not: deployIfNotExists policy
    # remediations fire on the new site and hold its lock while they run. The CLI then gives up
    # with a GatewayTimeout, or a 429 "Cannot acquire exclusive lock" (extended code 59206),
    # even though ARM goes on to finish the job.
    #
    # So a failed create is not treated as a failed creation. Re-issuing it would only add more
    # contention for the same lock; instead the site is polled for, and only a site that never
    # appears is a real failure.
    local create_err="${TMPDIR:-/tmp}/tokensvc-create.$$"
    local -a create_args=(-g "$FUNC_RG" -n "$FUNC_APP" --storage-account "$FUNC_STORAGE"
      --runtime node --runtime-version "$NODE_VERSION" --assign-identity "[system]")
    if [[ "$HOSTING_PLAN" == "flex" ]]; then
      # Flex is Linux-only and always Functions v4, so neither flag applies here.
      create_args+=(--flexconsumption-location "$FUNC_LOC")
    else
      create_args+=(--consumption-plan-location "$FUNC_LOC" --functions-version 4 --os-type Linux)
    fi

    if ! az functionapp create "${create_args[@]}" >/dev/null 2>"$create_err"; then

      if grep -qiE "exclusive lock|GatewayTimeout|429|Conflict|timed out" "$create_err"; then
        log "Create did not return cleanly (lock or gateway timeout). ARM often completes it"
        log "anyway, so waiting for the site to appear rather than re-issuing the create..."
        local waited=0
        while (( waited < 300 )); do
          sleep 15
          waited=$((waited + 15))
          if az functionapp show -g "$FUNC_RG" -n "$FUNC_APP" >/dev/null 2>&1; then
            log "Site exists after ${waited}s"
            break
          fi
          log "  still waiting (${waited}s)"
        done
        if ! az functionapp show -g "$FUNC_RG" -n "$FUNC_APP" >/dev/null 2>&1; then
          cat "$create_err" >&2
          rm -f "$create_err"
          fail "The Function App did not appear within 5 minutes of the create request.

The underlying error is above. If it mentions a lock or a gateway timeout, an Azure Policy
deployIfNotExists rule may be remediating new sites and holding their lock -- check
'az monitor activity-log list -g $FUNC_RG --offset 1h --status Failed'. Waiting a few minutes
and re-running is usually enough; the script picks up a site that has since appeared."
        fi
      else
        cat "$create_err" >&2
        rm -f "$create_err"
        fail "Could not create the Function App."
      fi
    fi
    rm -f "$create_err"

    # Policy remediation can still hold the lock just after the site appears, which would make
    # the next write fail the same way. A short settle costs less than that failure.
    log "Letting the site settle before configuring it..."
    sleep 20
  fi

  # A Key Vault with public network access disabled is only reachable over its private endpoint,
  # so the app has to be inside that VNet. Without this the Key Vault reference in
  # FLUID_TENANT_KEY never resolves, the app setting keeps its literal @Microsoft.KeyVault(...)
  # value, and every request fails on configuration -- with nothing about it pointing at
  # networking.
  local kv_public
  kv_public="$(az keyvault show -g "$RG" -n "$KV" --query properties.publicNetworkAccess -o tsv 2>/dev/null || echo Enabled)"
  if [[ "$kv_public" == "Disabled" && -n "$VNET_NAME" ]]; then
    if [[ -n "$(az functionapp show -g "$FUNC_RG" -n "$FUNC_APP" --query virtualNetworkSubnetId -o tsv 2>/dev/null)" ]]; then
      log "Already integrated with $VNET_NAME/$FUNC_SUBNET"
    else
      if ! az network vnet subnet show -g "$RG" --vnet-name "$VNET_NAME" -n "$FUNC_SUBNET" >/dev/null 2>&1; then
        log "Creating delegated subnet $FUNC_SUBNET ($FUNC_SUBNET_PREFIX) for VNet integration"
        az network vnet subnet create -g "$RG" --vnet-name "$VNET_NAME" -n "$FUNC_SUBNET" \
          --address-prefixes "$FUNC_SUBNET_PREFIX" \
          --delegations Microsoft.App/environments >/dev/null
      fi
      log "Integrating the Function App into $VNET_NAME/$FUNC_SUBNET so it can reach $KV"
      az functionapp vnet-integration add -g "$FUNC_RG" -n "$FUNC_APP" \
        --vnet "$(az network vnet show -g "$RG" -n "$VNET_NAME" --query id -o tsv)" \
        --subnet "$FUNC_SUBNET" >/dev/null ||
        fail "Could not integrate the Function App with $VNET_NAME. It must be in the same region
as the VNet ($FUNC_LOC), since VNet integration is regional."
    fi
    # Route outbound traffic through the VNet, or Key Vault is still reached over the internet
    # and the private endpoint is not used.
    site_write "Routing outbound traffic through the VNet" \
      az functionapp config set -g "$FUNC_RG" -n "$FUNC_APP" --vnet-route-all-enabled true
  fi

  local site_id
  site_id="$(az functionapp show -g "$FUNC_RG" -n "$FUNC_APP" --query id -o tsv)"
  [[ -n "$site_id" ]] || fail "Could not determine the Function App's resource ID."

  # Assigned separately rather than trusting the create above. A create that fails partway can
  # still leave the site behind, and the exists-check then skips the very command that would
  # have assigned the identity -- so the deploy proceeds to Key Vault and dies there instead,
  # a long way from the cause. This is idempotent, so it also covers the healthy path.
  if [[ -z "$(az functionapp identity show -g "$FUNC_RG" -n "$FUNC_APP" --query principalId -o tsv 2>/dev/null)" ]]; then
    log "Assigning system-assigned managed identity"
    site_write "Assigning managed identity" az functionapp identity assign -g "$FUNC_RG" -n "$FUNC_APP"
  fi

  site_write "Enabling HTTPS-only" az functionapp update -g "$FUNC_RG" -n "$FUNC_APP" --set httpsOnly=true
  site_write "Hardening site configuration" az resource update \
    --ids "$site_id/config/web" --api-version 2023-12-01 \
    --set properties.minTlsVersion=1.2 properties.scmMinTlsVersion=1.2 \
      properties.ftpsState=Disabled properties.http20Enabled=true \
      properties.remoteDebuggingEnabled=false properties.healthCheckPath=/api/health
  for policy in ftp scm; do
    site_write "Disabling $policy basic publishing credentials" az resource update \
      --ids "$site_id/basicPublishingCredentialsPolicies/$policy" \
      --api-version 2022-03-01 --set properties.allow=false
  done
  log "HTTPS-only, TLS 1.2, disabled publishing credentials, and health checks enforced"
}

# ---------------------------------------------------------------------------
# Tenant key into Key Vault, read by the app's managed identity
# ---------------------------------------------------------------------------
phase_tenant_key() {
  banner "Tenant keys"

  local tenant tenant_check_err
  local -a existing_tenants=()
  tenant_check_err="${TMPDIR:-/tmp}/tokensvc-tenant-check.$$"
  for tenant in "${TENANTS[@]}"; do
    if "$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMS_FILE" \
      get "$tenant" >/dev/null 2>"$tenant_check_err"; then
      existing_tenants+=("$tenant")
    elif grep -q "Tenant \"$tenant\" not found" "$tenant_check_err"; then
      if [[ "$tenant" == "$FLUID_TENANT" ]]; then
        rm -f "$tenant_check_err"
        fail "Default tenant '$tenant' does not exist. Create it before deploying the token service."
      fi
      log "WARNING: Tenant '$tenant' is listed in tokenService.additionalTenants but does not exist; skipping it."
    else
      cat "$tenant_check_err" >&2
      rm -f "$tenant_check_err"
      fail "Could not verify whether tenant '$tenant' exists."
    fi
  done
  rm -f "$tenant_check_err"
  TENANTS=("${existing_tenants[@]}")

  local principal_id kv_id
  principal_id="$(az functionapp identity show -g "$FUNC_RG" -n "$FUNC_APP" --query principalId -o tsv)"
  [[ -n "$principal_id" ]] || fail "Function App has no system-assigned managed identity."

  kv_id="$(az keyvault show -g "$RG" -n "$KV" --query id -o tsv)"

  log "Granting 'Key Vault Secrets User' to the Function App identity"
  ensure_role_assignment "$principal_id" ServicePrincipal "Key Vault Secrets User" "$kv_id"

  # Reading a tenant key and writing it here is a data-plane operation, which subscription
  # Owner does not confer -- Owner's Actions:["*"] excludes DataActions. Granted to the operator
  # too, not just the Function App, which only ever reads.
  local caller_object_id
  caller_object_id="$(current_principal_object_id)"
  [[ -n "$caller_object_id" && "$caller_object_id" != "null" ]] ||
    fail "Could not determine the signed-in caller's object id from an ARM token."
  log "Granting 'Key Vault Secrets Officer' to the caller for this deploy"
  ensure_role_assignment "$caller_object_id" User "Key Vault Secrets Officer" "$kv_id"
  [[ -n "$LAST_CREATED_ROLE_ID" ]] && TEMP_ROLE_ASSIGNMENT_IDS+=("$LAST_CREATED_ROLE_ID")

  # Secret reads/writes are data-plane calls from the signed-in operator's workstation. Open a
  # private-endpoint-only vault only for this short phase, then restore its original state below.
  # The EXIT trap also restores it if any command fails or the run is interrupted.
  local kv_public_access
  kv_public_access="$(az keyvault show -g "$RG" -n "$KV" --query properties.publicNetworkAccess -o tsv)"
  if [[ "$kv_public_access" != "Enabled" ]]; then
    KV_PUBLIC_ACCESS_ORIGINAL="$kv_public_access"
    log "Temporarily enabling public network access on $KV for tenant-key provisioning"
    az keyvault update -g "$RG" -n "$KV" --public-network-access Enabled >/dev/null
    sleep 10
  fi

  SECRET_URIS=()
  local tenant secret key vault_uri
  # Versionless secret URIs. `az keyvault secret show --query id` returns a VERSIONED URI
  # (.../secrets/<name>/<version>), and a Key Vault reference built from one is pinned to that
  # version forever: rotating the tenant key and writing a new secret version would leave the
  # Function App still signing with the old key, no matter how many times it was restarted.
  # That silently defeats the whole rotation procedure (tenant-admin rotate -> az keyvault secret
  # set), so the reference is built from the vault URI and secret name instead, which App Service
  # re-resolves to the current version.
  vault_uri="$(az keyvault show -g "$RG" -n "$KV" --query properties.vaultUri -o tsv)"
  [[ -n "$vault_uri" ]] || fail "Could not read the vault URI for $KV."
  vault_uri="${vault_uri%/}"

  for tenant in "${TENANTS[@]}"; do
    secret="$(kv_secret_name "$tenant")"

    if az keyvault secret show --vault-name "$KV" --name "$secret" >/dev/null 2>&1; then
      log "Secret $secret already present, leaving it untouched"
    else
      log "Reading the '$tenant' tenant key and storing it as $secret"
      key="$("$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMS_FILE" \
        get-key "$tenant" --key key1 2>/dev/null | jq -r .key1)"
      [[ -n "$key" && "$key" != "null" ]] ||
        fail "Could not read the key for tenant '$tenant'. Confirm the tenant exists (tenant-admin list)."
      keyvault_secret_set_with_retry "$KV" "$secret" "$key"
    fi

    SECRET_URIS+=("$vault_uri/secrets/$secret")
  done

  restore_keyvault_public_access
}

# ---------------------------------------------------------------------------
# Application settings
# ---------------------------------------------------------------------------
phase_app_settings() {
  banner "Application settings"

  # riddler's own ceiling, read from the values file that configures it. A token minted longer
  # than this is rejected at connect time once enableTokenExpiration is on, so the two are kept
  # aligned deliberately rather than defaulting independently.
  local max_lifetime values_file
  values_file="$SELFHOST_ROOT/azure/routerlicious-values.yaml"
  max_lifetime="$(awk '/^auth:/{inauth=1; next} /^[^[:space:]]/{inauth=0} inauth && /maxTokenLifetimeSec:/{gsub(/[^0-9]/,"",$2); print $2; exit}' "$values_file" 2>/dev/null || true)"
  [[ "$max_lifetime" =~ ^[0-9]+$ ]] || max_lifetime=3600

  log "Applying settings (token lifetime ${LIFETIME}s, riddler ceiling ${max_lifetime}s)"

  # The default tenant's key is FLUID_TENANT_KEY; each additional tenant gets its own setting,
  # matching what src/config.js looks for. Building the list here keeps a single `az` call.
  #
  # No Oryx build settings: Linux Consumption deploys by running the package as uploaded, and
  # asking for a build as well makes the deployment fail. Dependencies ship inside the zip.
  local settings=(
    "FLUID_TENANT_KEY=@Microsoft.KeyVault(SecretUri=${SECRET_URIS[0]})"
    "FLUID_TENANT_ID=$FLUID_TENANT"
    "FLUID_ALLOWED_TENANTS=$(IFS=,; printf '%s' "${TENANTS[*]}")"
    "FLUID_TOKEN_LIFETIME_SEC=$LIFETIME"
    "FLUID_MAX_TOKEN_LIFETIME_SEC=$max_lifetime"
    "FLUID_ENTRA_TENANT_ID=$ENTRA_TENANT_ID"
    "FLUID_AUTHORIZATION_POLICY=$AUTH_POLICY"
  )

  local i
  for ((i = 1; i < ${#TENANTS[@]}; i++)); do
    settings+=("$(key_setting_name "${TENANTS[$i]}")=@Microsoft.KeyVault(SecretUri=${SECRET_URIS[$i]})")
  done

  log "Serving tenants: ${TENANTS[*]} (authorization policy: $AUTH_POLICY)"
  site_write "Applying app settings" az functionapp config appsettings set -g "$FUNC_RG" -n "$FUNC_APP" --settings "${settings[@]}"

  # The shipped authorize() confirms a tenant is served, not that the caller belongs to it, so
  # with several tenants every authenticated user can reach all of them. Nothing at runtime
  # makes that visible — every request just succeeds — so it is called out here.
  if [[ ${#TENANTS[@]} -gt 1 && "$AUTH_POLICY" == "default" ]]; then
    log ""
    log "NOTE: ${#TENANTS[@]} tenants are configured and the default authorization policy grants"
    log "      every authenticated user access to all of them. If these tenants represent"
    log "      different groups of people, switch to tenantScopedAuthorize in src/authorize.js"
    log "      before relying on this. Set tokenService.authorizationPolicy to tenant-scoped."
  fi
}

# ---------------------------------------------------------------------------
# Easy Auth
# ---------------------------------------------------------------------------
phase_easy_auth() {
  banner "Easy Auth"

  # authSettingsV2 is the surface that supports Return401, so the site has to be on config
  # version v2 before anything below will stick.
  #
  # A brand-new Function App reports v1, not v2. The version lives on the CLASSIC authsettings
  # resource as a `configVersion` field, and it holds its default of "v1" until v2 auth is
  # configured for the first time -- it does not mean legacy auth is switched on (a new site has
  # enabled=false). So this upgrade runs on essentially every first deployment, which is
  # expected, not a sign that something created the app wrongly.
  #
  # stderr is deliberately not discarded and stdin is closed: a swallowed prompt here is what
  # made this line hang silently (see ensure_az_extension above), and a failure that is reported
  # as "assume v2" would skip the upgrade and leave Return401 unconfigurable.
  local config_version
  config_version="$(az webapp auth config-version show -g "$FUNC_RG" -n "$FUNC_APP" \
    --query configVersion -o tsv </dev/null || fail "Could not read the auth config version for
$FUNC_APP. This needs the authV2 az CLI extension: az extension add --name authV2")"

  if [[ "$config_version" == "v1" ]]; then
    log "Auth config version is v1 (the default for a new app); upgrading to v2"
    site_write "Upgrading auth config version" az webapp auth config-version upgrade -g "$FUNC_RG" -n "$FUNC_APP"
  else
    log "Auth config version is already $config_version"
  fi

  local issuer
  if [[ "$TOKEN_ISSUER_VERSION" == "v1" ]]; then
    issuer="https://sts.windows.net/$ENTRA_TENANT_ID/"
  else
    issuer="https://login.microsoftonline.com/$ENTRA_TENANT_ID/v2.0"
  fi

  log "Binding the Function App to App Registration $APP_ID (expecting $TOKEN_ISSUER_VERSION tokens)"
  site_write "Binding the App Registration" az webapp auth microsoft update -g "$FUNC_RG" -n "$FUNC_APP" \
    --client-id "$APP_ID" \
    --issuer "$issuer" \
    --allowed-audiences "$APP_ID_URI" \
    --yes

  # Return401 rather than RedirectToLoginPage: this is an API called with fetch(), and a 302
  # to a login page would surface to the client as an opaque CORS failure.
  # Two things are fixed up through the ARM surface because the CLI cannot express them.
  #
  # An empty allowedApplications list is an allow-list of nothing, not an absent restriction, so
  # Easy Auth authenticates the caller and then refuses it. That is a 403 with no body, after a
  # sign-in that succeeded -- distinguishable from a rejected token only in that an invalid token
  # gives 401 and a valid one gives 403. It is removed rather than populated, since restricting
  # which client applications may call is a decision for the operator, not a default.
  #
  # allowedAudiences must list both the Application ID URI and the bare client id. Easy Auth
  # checks the token's `aud` against this list and nothing else -- passing --client-id does not
  # implicitly accept it as an audience. Which of the two a token carries depends on the app
  # registration's requestedAccessTokenVersion, so a list with only one of them rejects valid
  # sign-ins with a bodiless 403 that looks nothing like an audience problem. --allowed-audiences
  # accepts a single value, hence doing it here.
  #
  # Upgrading auth config from v1 also leaves apple/facebook/github/google/twitter/MSA enabled
  # with empty registrations. Easy Auth cannot initialise a provider it has no client id for, so
  # the unused ones are turned off explicitly rather than left in that state.
  log "Requiring authentication (unauthenticated callers get 401)"
  site_write "Requiring authentication" az webapp auth update -g "$FUNC_RG" -n "$FUNC_APP" \
    --enabled true \
    --unauthenticated-client-action Return401 \
    --redirect-provider azureactivedirectory \
    --require-https true

  local auth_url disabled
  auth_url="https://management.azure.com/subscriptions/$SUB/resourceGroups/$FUNC_RG/providers/Microsoft.Web/sites/$FUNC_APP/config/authsettingsV2?api-version=2023-12-01"
  disabled="$(az rest --method GET --url "$auth_url" 2>/dev/null | jq -c \
    --arg uri "$APP_ID_URI" --arg appid "$APP_ID" '
    .properties as $p
    | ($p.identityProviders // {}) as $ip
    | ($p.globalValidation // {}) as $gv
    | ($ip | with_entries(if .key == "azureActiveDirectory" then . else .value = {enabled:false} end)) as $ip2
    | ($ip2 | .azureActiveDirectory.validation.allowedAudiences =
        (((.azureActiveDirectory.validation.allowedAudiences // []) + [$uri, $appid]) | unique)
            | del(.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedApplications)) as $ip3
    | ($gv | .excludedPaths = (((.excludedPaths // []) + ["/api/health"]) | unique)) as $gv2
    | { properties: ($p | .identityProviders = $ip3 | .globalValidation = $gv2) }' 2>/dev/null || true)"
  if [[ -n "$disabled" && "$disabled" != "null" ]]; then
    printf '%s' "$disabled" > "${TMPDIR:-/tmp}/tokensvc-auth.$$"
    site_write "Setting audiences and disabling unused providers" \
      az rest --method PUT --url "$auth_url" --headers "Content-Type=application/json" \
      --body "@${TMPDIR:-/tmp}/tokensvc-auth.$$"
    rm -f "${TMPDIR:-/tmp}/tokensvc-auth.$$"
  fi

}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
phase_cors() {
  banner "CORS"

  # Browser clients call this endpoint cross-origin with an Authorization header, which makes
  # the browser send a preflight OPTIONS request first. That preflight carries no credentials,
  # so it would fail against an endpoint requiring authentication.
  #
  # Configuring CORS at the platform level (here) rather than in function code is what makes
  # this work: App Service answers the preflight itself, before Easy Auth runs. CORS headers
  # emitted from application code would sit *behind* Easy Auth, the preflight would get 401,
  # and the browser would block every request with an opaque CORS error.
  local origins
  origins="$(jq -r '.tokenService.allowedOrigins // [] | .[]' "$PARAMS_FILE")"
  local existing
  existing="$(az functionapp cors show -g "$FUNC_RG" -n "$FUNC_APP" --query "allowedOrigins" -o tsv 2>/dev/null || true)"

  # A wildcard defeats the browser boundary. Refuse both a requested wildcard and one left on
  # an existing app rather than deploying around a known-unsafe origin policy.
  if grep -qxF '*' <<<"$origins" || grep -qxF '*' <<<"$existing"; then
    fail "CORS contains '*'. Remove it and list explicit tokenService.allowedOrigins."
  fi

  if [[ -z "$origins" ]]; then
    log "No tokenService.allowedOrigins configured."
    log "  Server-side callers are unaffected. A browser client will be blocked until you add"
    log "  its origin:  az functionapp cors add -g $RG -n $FUNC_APP -a https://your-app.example.com"
    return
  fi

  while IFS= read -r origin; do
    [[ -n "$origin" ]] || continue
    if grep -qxF "$origin" <<<"$existing"; then
      log "Origin already allowed: $origin"
    else
      log "Allowing origin: $origin"
      site_write "Allowing origin $origin" az functionapp cors add -g "$FUNC_RG" -n "$FUNC_APP" --allowed-origins "$origin"
    fi
  done <<<"$origins"

}

# ---------------------------------------------------------------------------
# Code deployment
# ---------------------------------------------------------------------------
phase_deploy_code() {
  banner "Deploy code"

  command -v npm >/dev/null || fail "npm is required to stage dependencies for deployment."

  local stage zip
  stage="$(mktemp -d)"
  zip="$stage/token-service.zip"

  # Linux Consumption runs the app straight from the uploaded package, so nothing installs
  # dependencies on the far side -- node_modules has to be in the zip. Only the runtime files
  # are staged; tests, the client sample, docs and this script are not part of the app.
  log "Staging application files"
  mkdir -p "$stage/app"
  cp "$SERVICE_DIR/host.json" "$SERVICE_DIR/package.json" "$stage/app/"
  [[ -f "$SERVICE_DIR/package-lock.json" ]] && cp "$SERVICE_DIR/package-lock.json" "$stage/app/"
  cp -R "$SERVICE_DIR/src" "$stage/app/src"

  log "Installing production dependencies"
  # The one dependency is pure JavaScript, so a local install is portable to the Linux host.
  ( cd "$stage/app" && npm install --omit=dev --no-audit --no-fund --silent ) ||
    fail "npm install failed while staging the deployment package."

  ( cd "$stage/app" && zip -qr "$zip" . )

  if [[ "$HOSTING_PLAN" == "flex" ]]; then
    # Flex manages its own deployment storage container and ignores WEBSITE_RUN_FROM_PACKAGE,
    # so the package is handed to the platform rather than staged in blob storage by hand.
    # config-zip, not `functionapp deploy --type zip`: the latter posts a content type Flex's
    # deployment endpoint rejects with 415.
    log "Publishing to $FUNC_APP ($(du -h "$zip" | cut -f1))"
    site_write "Publishing code" az functionapp deployment source config-zip \
      -g "$FUNC_RG" -n "$FUNC_APP" --src "$zip"
  else
    # Classic Consumption: upload the package and point WEBSITE_RUN_FROM_PACKAGE at it, rather
    # than going through Kudu. Kudu's zip-deploy needs SCM basic publishing credentials, and an
    # Azure Policy commonly disables those -- re-enabling only holds until the policy remediates
    # again, so deployments would work intermittently at best. This is the same mechanism
    # zip-deploy uses underneath, without the dependency on that endpoint.
    local container="function-releases" package="tokenservice-$(date -u +%Y%m%d%H%M%S).zip"
    local conn expiry url

    log "Uploading package ($(du -h "$zip" | cut -f1)) to $FUNC_STORAGE/$container"
    conn="$(az storage account show-connection-string -g "$FUNC_RG" -n "$FUNC_STORAGE" \
      --query connectionString -o tsv)"

    az storage container create --name "$container" --connection-string "$conn" \
      --only-show-errors >/dev/null

    az storage blob upload --container-name "$container" --name "$package" --file "$zip" \
      --connection-string "$conn" --overwrite --only-show-errors >/dev/null ||
      fail "Could not upload the deployment package to $FUNC_STORAGE."

    # The app reads this URL on every cold start, so the SAS has to outlive the deployment.
    expiry="$(date -u -v+2y '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -d '+2 years' '+%Y-%m-%dT%H:%MZ')"
    url="$(az storage blob generate-sas --container-name "$container" --name "$package" \
      --permissions r --expiry "$expiry" --connection-string "$conn" \
      --full-uri --only-show-errors -o tsv)" ||
      fail "Could not generate a read SAS for the deployment package."

    site_write "Pointing the app at the new package" \
      az functionapp config appsettings set -g "$FUNC_RG" -n "$FUNC_APP" \
      --settings "WEBSITE_RUN_FROM_PACKAGE=$url"

    log "Restarting to pick up the new package"
    site_write "Restarting" az functionapp restart -g "$FUNC_RG" -n "$FUNC_APP"
  fi

  rm -rf "$stage"
}

# ---------------------------------------------------------------------------
# VERIFY
# ---------------------------------------------------------------------------
phase_verify() {
  banner "VERIFY"

  # `az functionapp show` returns an empty defaultHostName on Flex Consumption; `az webapp show`
  # reports it for both hosting models.
  local host url site_id
  host="$(az webapp show -g "$FUNC_RG" -n "$FUNC_APP" --query defaultHostName -o tsv 2>/dev/null)"
  [[ -n "$host" ]] || fail "Could not determine the Function App's hostname."
  url="https://$host/api/token"
  site_id="$(az functionapp show -g "$FUNC_RG" -n "$FUNC_APP" --query id -o tsv)"
  [[ -n "$site_id" ]] || fail "Could not determine the Function App's resource ID."

  local site_config ftp_basic scm_basic
  site_config="$(az resource show --ids "$site_id/config/web" \
    --api-version 2023-12-01 --query properties -o json)"
  [[ "$(jq -r '.minTlsVersion' <<<"$site_config")" == "1.2" ]] ||
    fail "Function App minimum TLS version is not 1.2."
  [[ "$(jq -r '.scmMinTlsVersion' <<<"$site_config")" == "1.2" ]] ||
    fail "Function App SCM minimum TLS version is not 1.2."
  [[ "$(jq -r '.ftpsState' <<<"$site_config")" == "Disabled" ]] ||
    fail "Function App FTPS is not disabled."
  [[ "$(jq -r '.remoteDebuggingEnabled' <<<"$site_config")" == "false" ]] ||
    fail "Function App remote debugging is not disabled."
  [[ "$(jq -r '.http20Enabled' <<<"$site_config")" == "true" ]] ||
    fail "Function App HTTP/2 is not enabled."
  [[ "$(jq -r '.healthCheckPath' <<<"$site_config")" == "/api/health" ]] ||
    fail "Function App health check path is not /api/health."
  [[ "$(az resource show --ids "$site_id" --api-version 2024-04-01 \
    --query properties.httpsOnly -o tsv)" == "true" ]] ||
    fail "Function App HTTPS-only is not enabled."
  ftp_basic="$(az resource show --ids "$site_id/basicPublishingCredentialsPolicies/ftp" \
    --api-version 2022-03-01 --query properties.allow -o tsv)"
  scm_basic="$(az resource show --ids "$site_id/basicPublishingCredentialsPolicies/scm" \
    --api-version 2022-03-01 --query properties.allow -o tsv)"
  [[ "$ftp_basic" == "false" && "$scm_basic" == "false" ]] ||
    fail "Function App basic publishing credentials are not fully disabled."
  log "PASS: Function App platform hardening is enforced"

  # A first request after deployment is a cold start, so a 000/503 early on says nothing about
  # whether the security boundary works. Poll until it answers.
  log "Waiting for the app to come up..."
  local status="000" waited=0
  while (( waited < 240 )); do
    sleep 20
    waited=$((waited + 20))
    status="$(curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
      -o /dev/null -w '%{http_code}' --max-time 30 "$url" || echo "000")"
    case "$status" in
      401|403|200) break ;;
      *) log "  still starting (${waited}s, HTTP $status)" ;;
    esac
  done

  local health_status
  health_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    "https://$host/api/health" || echo "000")"
  [[ "$health_status" == "200" ]] ||
    fail "Anonymous health endpoint returned HTTP $health_status instead of 200."
  log "PASS: health endpoint is reachable without exposing token issuance"

  case "$status" in
    401|403)
      log "PASS: unauthenticated request rejected with $status"
      ;;
    200)
      fail "Unauthenticated request returned 200 and may have been issued a token. Easy Auth is
not enforcing. Do not use this deployment until 'az webapp auth show' reports enabled=true."
      ;;
    *)
      log "WARNING: unauthenticated request returned $status (expected 401). If the app is"
      log "         still starting, re-run: curl -s -X POST -H 'Content-Type: application/json' -d '{}' -o /dev/null -w '%{http_code}' $url"
      ;;
  esac

  # The check above is necessary but not sufficient: src/identity.js also returns 401 when
  # x-ms-client-principal is absent, so a 401 proves only that SOMETHING refused the request --
  # it looks identical whether Easy Auth is enforcing or switched off entirely. Assert the
  # platform configuration directly, because that is the boundary being relied on.
  #
  # Read over ARM rather than with `az webapp auth show`, which returns an empty object here
  # (globalValidation {} / platform.enabled null) even when auth is fully configured and
  # enforcing -- asserting on that output would fail every deploy of a correctly secured app.
  local auth_json auth_required
  auth_json="$(az rest --method GET --uri \
    "https://management.azure.com/subscriptions/$SUB/resourceGroups/$FUNC_RG/providers/Microsoft.Web/sites/$FUNC_APP/config/authsettingsV2?api-version=2023-01-01" \
    -o json 2>/dev/null || true)"
  auth_required="$(printf '%s' "$auth_json" \
    | jq -r '.properties.globalValidation.requireAuthentication // empty' 2>/dev/null || true)"

  if [[ "$auth_required" == "true" ]]; then
    log "PASS: Easy Auth requires authentication at the platform"
  elif [[ -z "$auth_json" || -z "$auth_required" ]]; then
    # Could not read it. The forged-principal probe below still covers the boundary end to end,
    # so this is reported rather than treated as a failure.
    log "WARNING: could not read authsettingsV2 to confirm Easy Auth is enforcing. Verify with:"
    log "         az rest --method GET --uri \"https://management.azure.com/subscriptions/$SUB/resourceGroups/$FUNC_RG/providers/Microsoft.Web/sites/$FUNC_APP/config/authsettingsV2?api-version=2023-01-01\""
  else
    fail "Easy Auth is not requiring authentication
(globalValidation.requireAuthentication=$auth_required). Without it the platform forwards
anonymous requests to the function, and anything that forges an x-ms-client-principal header is
issued a Fluid token. Re-run this script to reconfigure it."
  fi

  # And prove it end to end: the platform must reject a forged principal header before the
  # function ever sees it. src/identity.js trusts that header precisely because Easy Auth
  # overwrites any client-supplied copy, so this is the assumption the whole design rests on.
  local forged forged_status
  forged="$(printf '%s' '{"auth_typ":"aad","claims":[]}' | base64 | tr -d '\r\n')"
  forged_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    -H "x-ms-client-principal: $forged" "$url" || echo "000")"
  case "$forged_status" in
    401|403)
      log "PASS: forged x-ms-client-principal rejected with $forged_status"
      ;;
    200)
      fail "A forged x-ms-client-principal header was issued a token (HTTP 200). Easy Auth is not
stripping client-supplied principal headers, so anyone can mint Fluid tokens. Do not use this
deployment."
      ;;
    *)
      log "WARNING: forged-principal probe returned $forged_status (expected 401)."
      ;;
  esac

  banner "Done"
  log "Token endpoint:  $url"
  log "Client app id:   $APP_ID"
  log "Client scope:    $APP_ID_URI/$SCOPE_NAME"
  log ""
  # Optional: with the scope set to "Admins and users", each user consents once at first
  # sign-in. Granting tenant-wide consent needs an administrator and only removes that prompt.
  if [[ -n "$APP_REG_ID" ]]; then
    # admin-consent is itself a Graph call, so it is no more available than the rest.
    log "Users consent once at first sign-in. To remove that prompt for everyone, an"
    log "administrator can grant tenant-wide consent in the portal (Entra ID >"
    log "App registrations > your app > API permissions > Grant admin consent)."
  else
    log "Users consent once at first sign-in. To remove that prompt for everyone, an"
    log "administrator can run:"
    log "  az ad app permission admin-consent --id $APP_ID"
  fi
  log ""
  log "Wire up a client with token-service/client/entraTokenProvider.js."
}

phase_app_registration
phase_function_app
phase_tenant_key
phase_app_settings
phase_easy_auth
phase_cors
phase_deploy_code
phase_verify
