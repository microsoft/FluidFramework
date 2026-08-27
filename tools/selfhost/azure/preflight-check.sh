#!/usr/bin/env bash
# azure/preflight-check.sh - non-mutating deployment validation pass for azure/deploy.sh.
# Run this before deploy to catch common blockers: global name conflicts (including
# Key Vault/Cosmos soft-delete), quota shortfalls (AKS vCPUs, storage, Front Door), and
# Helm values/template render errors, using only read-only Azure calls and local rendering.
#
# Usage: azure/preflight-check.sh [path/to/deploy.parameters.json]
set -uo pipefail   # deliberately NOT -e: a single failed check must not abort the rest

SELFHOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARAMS_FILE="${1:-$SELFHOST_ROOT/azure/deploy.parameters.json}"

if [[ ! -f "$PARAMS_FILE" ]]; then
  echo "ERROR: parameters file not found: $PARAMS_FILE" >&2
  echo "Copy azure/deploy.parameters.example.json to azure/deploy.parameters.json and fill it in." >&2
  exit 1
fi

log()    { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
banner() { printf '\n=== %s ===\n' "$*"; }
FAILURES=0
fail() { printf '  FAIL: %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }
ok()   { printf '  OK:   %s\n' "$*"; }
note() { printf '  NOTE: %s\n' "$*"; }

REQUIRED_TOOLS=(az jq helm)
missing=()
for t in "${REQUIRED_TOOLS[@]}"; do
  command -v "$t" >/dev/null 2>&1 || missing+=("$t")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: missing required tools: ${missing[*]}" >&2
  exit 1
fi

ensure_az_extension() {
  local ext="$1"
  if ! az extension show --name "$ext" >/dev/null 2>&1; then
    log "Installing the '$ext' az CLI extension"
    az extension add --name "$ext" --yes >/dev/null 2>&1 </dev/null || {
      echo "ERROR: could not install the '$ext' az CLI extension. Install it manually and rerun:" >&2
      echo "  az extension add --name $ext" >&2
      exit 1
    }
  fi
}
ensure_az_extension redisenterprise
az redisenterprise create --help 2>/dev/null | grep --fixed-strings -- '--access-keys-authentication' >/dev/null || {
  echo "ERROR: the redisenterprise az CLI extension is too old. Upgrade it and rerun:" >&2
  echo "  az extension update --name redisenterprise" >&2
  exit 1
}
export AZURE_EXTENSION_USE_DYNAMIC_INSTALL=yes_without_prompt

# ---------------------------------------------------------------------------
# Load parameters (same shape/defaults as deploy.sh)
# ---------------------------------------------------------------------------
jqr() { jq -r "$1 // empty" "$PARAMS_FILE"; }

SUB="$(jqr '.subscriptionId')"
RG="$(jqr '.resourceGroup')"
RG_LOC="$(jqr '.location')"
FLUID_REPO_DIR="$(jqr '.fluidRepoDir')"
if [[ "$FLUID_REPO_DIR" == "~/"* ]]; then
  FLUID_REPO_DIR="$HOME/${FLUID_REPO_DIR:2}"
elif [[ "$FLUID_REPO_DIR" == "~" ]]; then
  FLUID_REPO_DIR="$HOME"
fi
BUILD_ACR="$(jqr '.buildAcr.name')"
DEPLOY_ACR="$(jqr '.deployAcr.name')"
AKS="$(jqr '.aks.name')"
AKS_LOC="$(jqr '.aks.location')"; AKS_LOC="${AKS_LOC:-$RG_LOC}"
AKS_NODE_VM_SIZE="$(jqr '.aks.systemNodeVmSize')"; AKS_NODE_VM_SIZE="${AKS_NODE_VM_SIZE:-Standard_D4s_v3}"
AKS_NODE_COUNT="$(jqr '.aks.systemNodeCount')"; AKS_NODE_COUNT="${AKS_NODE_COUNT:-3}"
# Same default-to-AKS_NODE_COUNT fallback as deploy.sh's own AKS_NODE_MIN_COUNT -- the vCPU
# quota check below validates against this floor, see the comment there.
AKS_NODE_MIN_COUNT="$(jqr '.aks.systemNodeMinCount')"; AKS_NODE_MIN_COUNT="${AKS_NODE_MIN_COUNT:-$AKS_NODE_COUNT}"
# Same array-of-numbers shape/extraction as deploy.sh's own AKS_ZONES, including the null-check
# (not a plain `${VAR:-default}`) so an explicit [] (opt out of zones) isn't mistaken for unset.
if jq -e '.aks.availabilityZones == null' "$PARAMS_FILE" >/dev/null 2>&1; then
  AKS_ZONES="1 2 3"
else
  AKS_ZONES="$(jq -r '.aks.availabilityZones[]?' "$PARAMS_FILE" | tr '\n' ' ')"
fi
KV="$(jqr '.keyVault.name')"
COSMOS="$(jqr '.cosmos.clusterName')"
# Same string-casing convention as deploy.sh's own COSMOS_ZONE_REDUNDANT (matches
# `az cosmosdb create --locations isZoneRedundant=`'s expected "True"/"False" casing, not a
# JSON boolean).
COSMOS_ZONE_REDUNDANT="$(jqr '.cosmos.zoneRedundant')"; COSMOS_ZONE_REDUNDANT="${COSMOS_ZONE_REDUNDANT:-True}"
REDIS="$(jqr '.redis.clusterName')"
REDIS_LOC="$(jqr '.redis.location')"; REDIS_LOC="${REDIS_LOC:-$RG_LOC}"
REDIS_SKU="$(jqr '.redis.sku')"; REDIS_SKU="${REDIS_SKU:-Balanced_B5}"
REDIS_HIGH_AVAILABILITY="$(jqr '.redis.highAvailability')"
STORAGE="$(jqr '.storage.accountName')"
EVENTHUBS_NAMESPACE="$(jqr '.kafka.eventHubs.namespaceName')"
EVENTHUBS_SKU="$(jqr '.kafka.eventHubs.sku')"; EVENTHUBS_SKU="${EVENTHUBS_SKU:-Standard}"
EVENTHUBS_ZONE_REDUNDANT="$(jqr '.kafka.eventHubs.zoneRedundant')"; EVENTHUBS_ZONE_REDUNDANT="${EVENTHUBS_ZONE_REDUNDANT:-true}"
AFD="$(jqr '.frontDoor.profileName')"

banner "Parameters file completeness"
for required in SUB RG RG_LOC BUILD_ACR DEPLOY_ACR AKS KV COSMOS REDIS REDIS_HIGH_AVAILABILITY STORAGE AFD; do
  if [[ -z "${!required}" ]]; then
    fail "'$required' is missing from $PARAMS_FILE"
  else
    ok "$required = ${!required}"
  fi
done
if [[ -n "$BUILD_ACR" && "$BUILD_ACR" == "$DEPLOY_ACR" ]]; then
  fail "buildAcr.name and deployAcr.name must not be the same"
fi
legacy_redis_keys="$(jq -r '[((.redis // {}) | keys[]) | select(. == "vmSize" or . == "version" or . == "replicasPerMaster" or . == "zones")] | join(", ")' "$PARAMS_FILE")"
if [[ -n "$legacy_redis_keys" ]]; then
  fail "removed Azure Cache for Redis parameters are still present: redis.{$legacy_redis_keys}; replace the redis block from deploy.parameters.example.json"
fi
if [[ "$REDIS_SKU" != *_* ]]; then
  fail "redis.sku '$REDIS_SKU' is not an Azure Managed Redis SKU (for example, Balanced_B5)"
fi
if [[ "$REDIS_HIGH_AVAILABILITY" != "Enabled" && "$REDIS_HIGH_AVAILABILITY" != "Disabled" ]]; then
  fail "redis.highAvailability must be exactly 'Enabled' or 'Disabled' (got '${REDIS_HIGH_AVAILABILITY:-empty}')"
fi
if [[ $FAILURES -gt 0 ]]; then
  echo "Parameters file incomplete -- stopping (remaining checks need these values)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Azure login + subscription
# ---------------------------------------------------------------------------
banner "Azure login + subscription"
if ! az account show >/dev/null 2>&1; then
  fail "not logged in to Azure CLI -- run 'az login' first"
  echo "Cannot continue without an active session." >&2
  exit 1
fi
if az account set --subscription "$SUB" 2>/dev/null; then
  ok "subscription $SUB is selectable and active"
else
  fail "cannot select subscription $SUB -- check the id and your access"
fi

# ---------------------------------------------------------------------------
# Resource group
# ---------------------------------------------------------------------------
banner "Resource group"
if az group show -n "$RG" >/dev/null 2>&1; then
  actual_loc="$(az group show -n "$RG" --query location -o tsv)"
  ok "resource group $RG already exists in $actual_loc"
  if [[ "$actual_loc" != "$RG_LOC" ]]; then
    fail "parameters file says location=$RG_LOC but $RG is actually in $actual_loc -- deploy.sh uses the EXISTING group's location for the group itself, but per-resource 'location' overrides (aks.location, redis.location) may now be inconsistent"
  fi
else
  note "resource group $RG does not exist yet -- deploy.sh will create it in $RG_LOC"
fi

# Globally-unique resource names
# ---------------------------------------------------------------------------
banner "Globally-unique resource names"

# ACR
acr_check="$(az acr check-name --name "$DEPLOY_ACR" --query nameAvailable -o tsv 2>/dev/null)"
if [[ "$acr_check" == "true" ]]; then
  ok "ACR name '$DEPLOY_ACR' is available"
elif az acr show -g "$RG" -n "$DEPLOY_ACR" >/dev/null 2>&1; then
  ok "ACR '$DEPLOY_ACR' already exists in target RG $RG. deploy.sh will reuse it"
else
  fail "ACR name '$DEPLOY_ACR' is not available. Please pick a different deployAcr.name"
fi

# Storage account
storage_check="$(az storage account check-name --name "$STORAGE" --query nameAvailable -o tsv 2>/dev/null)"
if [[ "$storage_check" == "true" ]]; then
  ok "storage account name '$STORAGE' is available"
elif az storage account show -g "$RG" -n "$STORAGE" >/dev/null 2>&1; then
  ok "storage account '$STORAGE' already exists in target RG $RG -- deploy.sh will reuse it"
else
  fail "storage account name '$STORAGE' is not available -- pick a different storage.accountName"
fi

# Key Vault -- no direct check-name API; check live existence in-RG, then soft-delete list
# (the real conflict hit before: a deleted vault's name stays reserved by default for 90 days).
if az keyvault show -n "$KV" -g "$RG" >/dev/null 2>&1; then
  ok "Key Vault '$KV' already exists in target RG $RG -- deploy.sh will reuse it"
elif az keyvault list-deleted --query "[?name=='$KV']" -o tsv 2>/dev/null | grep -q .; then
  fail "Key Vault name '$KV' is SOFT-DELETED from a prior deployment -- purge it first (az keyvault purge -n $KV --location <loc>) or pick a different keyVault.name"
else
  ok "Key Vault name '$KV' has no soft-delete conflict"
fi

# Cosmos DB account name (globally unique -- it's a DNS name)
cosmos_check="$(az cosmosdb check-name-exists --name "$COSMOS" -o tsv 2>/dev/null)"
if [[ "$cosmos_check" == "false" ]]; then
  ok "Cosmos DB account name '$COSMOS' is available"
elif az cosmosdb show -n "$COSMOS" -g "$RG" >/dev/null 2>&1; then
  ok "Cosmos DB account '$COSMOS' already exists in target RG $RG -- deploy.sh will reuse it"
else
  fail "Cosmos DB account name '$COSMOS' is taken (possibly soft-deleted elsewhere) -- pick a different cosmos.clusterName"
fi

# Event Hubs namespace name (globally unique -- it's a servicebus.windows.net DNS name)
if [[ -z "$EVENTHUBS_NAMESPACE" ]]; then
  fail "kafka.eventHubs.namespaceName is not set -- deploy.sh has no ordering backend without it"
else
  eh_check="$(az eventhubs namespace exists --name "$EVENTHUBS_NAMESPACE" --query nameAvailable -o tsv 2>/dev/null)"
  if [[ "$eh_check" == "true" ]]; then
    ok "Event Hubs namespace name '$EVENTHUBS_NAMESPACE' is available"
  elif az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" >/dev/null 2>&1; then
    ok "Event Hubs namespace '$EVENTHUBS_NAMESPACE' already exists in target RG $RG -- deploy.sh will reuse it"
    # zoneRedundant is fixed at create time, so a mismatch here can never be repaired by re-running.
    existing_zr="$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query zoneRedundant -o tsv 2>/dev/null)"
    if [[ "$existing_zr" != "$EVENTHUBS_ZONE_REDUNDANT" ]]; then
      note "existing namespace has zoneRedundant=$existing_zr but parameters say $EVENTHUBS_ZONE_REDUNDANT -- create-time only, so this needs a NEW namespace to change"
    fi
  else
    fail "Event Hubs namespace name '$EVENTHUBS_NAMESPACE' is taken globally -- pick a different kafka.eventHubs.namespaceName"
  fi
fi

# Basic tier has no Kafka endpoint at all, and the failure surfaces late as an opaque broker
# connection error from deli/scribe rather than a create-time error.
if [[ "$EVENTHUBS_SKU" == "Basic" ]]; then
  fail "kafka.eventHubs.sku is 'Basic', which has no Kafka endpoint -- use Standard or higher"
else
  ok "Event Hubs SKU '$EVENTHUBS_SKU' supports the Kafka protocol"
fi

# Zone redundancy needs a region with Availability Zones, and is create-time only -- catching it
# here avoids a failed create after the resource group, AKS and Cosmos are already built.
if [[ "$EVENTHUBS_ZONE_REDUNDANT" == "true" ]]; then
  if az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" >/dev/null 2>&1; then
    : # already exists, handled above
  elif [[ -n "$(az vm list-skus -l "$RG_LOC" --query "[?resourceType=='virtualMachines'].locationInfo[0].zones[]" -o tsv 2>/dev/null | head -1)" ]]; then
    ok "$RG_LOC supports Availability Zones -- kafka.eventHubs.zoneRedundant=true is deployable"
  else
    fail "kafka.eventHubs.zoneRedundant is true but $RG_LOC appears to have no Availability Zone support -- set it to false (it is create-time only and cannot be changed later)"
  fi
fi

# Azure Managed Redis names are regionally scoped. There is no supported checkNameAvailability
# request for Microsoft.Cache/redisEnterprise, so check existing resources in this subscription
# and let the create operation remain authoritative across subscriptions.
if az redisenterprise show -n "$REDIS" -g "$RG" >/dev/null 2>&1; then
  ok "Azure Managed Redis '$REDIS' already exists in target RG $RG -- deploy.sh will verify and reuse it"
else
  redis_loc_normalized="$(printf '%s' "$REDIS_LOC" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
  redis_match="$(az resource list --resource-type Microsoft.Cache/redisEnterprise -o json | \
    jq -r --arg name "$REDIS" --arg location "$redis_loc_normalized" \
      '.[] | select(.name == $name and ((.location | ascii_downcase | gsub(" "; "")) == $location)) | .id' | head -1)"
  if [[ -n "$redis_match" ]]; then
    fail "Azure Managed Redis '$REDIS' already exists in $REDIS_LOC at $redis_match -- pick a different redis.clusterName or target that resource group"
  else
    note "no Azure Managed Redis named '$REDIS' was found in $REDIS_LOC in this subscription; Azure will perform the authoritative availability check during create"
  fi
  unset redis_loc_normalized redis_match
fi

# ---------------------------------------------------------------------------
# Storage account count quota -- Microsoft.Cache (Azure Managed Redis), Microsoft.DocumentDB (Cosmos DB),
# Microsoft.KeyVault, and Microsoft.ContainerRegistry expose no equivalent subscription-level
# usages/quota API (confirmed via `az provider show --namespace <ns>` for each -- none list a
# usages/checkResourceUsage resource type), so only Storage and Front Door (below) can be
# quota-checked this way.
# ---------------------------------------------------------------------------
banner "Storage account count quota ($RG_LOC)"
if az storage account show -g "$RG" -n "$STORAGE" >/dev/null 2>&1; then
  ok "storage account '$STORAGE' already exists in target RG $RG -- deploy.sh will reuse it (skipping quota check)"
else
  read -r storage_current storage_limit <<<"$(az storage account show-usage --location "$RG_LOC" \
    --query "[[currentValue, limit]]" -o tsv 2>/dev/null)"
  if [[ -z "$storage_limit" ]]; then
    note "could not read storage account quota for $RG_LOC"
  elif [[ $storage_current -lt $storage_limit ]]; then
    ok "quota OK: $storage_current/$storage_limit storage accounts used in $RG_LOC"
  else
    fail "quota SHORTFALL: $storage_current/$storage_limit storage accounts already used in $RG_LOC -- request a quota increase or delete unused accounts"
  fi
fi

# ---------------------------------------------------------------------------
# AKS node pool vCPU quota -- covers BOTH pools deploy.sh creates on the same VM size/family:
# the system pool AND gitrestpool (phase1_gitrest_nodepool, always exactly 1 node, hardcoded in
# deploy.sh, not configurable). Both draw from the same subscription-level vCPU family quota in
# this region, so undercounting gitrestpool's node would let this check pass while
# phase1_gitrest_nodepool still hits a real quota error.
#
# Sized against vcpus_per_node * (AKS_NODE_MIN_COUNT + 1) -- the system pool's steady-state
# floor plus one extra node's worth of vCPUs for gitrestpool.
# ---------------------------------------------------------------------------
banner "AKS node pool vCPU quota ($AKS_LOC, $AKS_NODE_VM_SIZE x $AKS_NODE_MIN_COUNT system + 1 gitrestpool)"
if az aks show -g "$RG" -n "$AKS" >/dev/null 2>&1; then
  ok "AKS cluster '$AKS' already exists in target RG $RG -- deploy.sh will reuse it (skipping quota check)"
else
  vm_family="$(az vm list-skus --location "$AKS_LOC" --size "$AKS_NODE_VM_SIZE" \
    --query "[?name=='$AKS_NODE_VM_SIZE'].family | [0]" -o tsv 2>/dev/null)"
  vcpus_per_node="$(az vm list-skus --location "$AKS_LOC" --size "$AKS_NODE_VM_SIZE" \
    --query "[?name=='$AKS_NODE_VM_SIZE'].capabilities[] | [?name=='vCPUs'].value | [0]" -o tsv 2>/dev/null)"
  if [[ -z "$vm_family" || -z "$vcpus_per_node" ]]; then
    note "could not resolve VM size '$AKS_NODE_VM_SIZE' in $AKS_LOC -- verify it's a valid, available SKU there"
  else
    required_vcpus=$(( vcpus_per_node * (AKS_NODE_MIN_COUNT + 1) ))
    read -r current_val limit_val <<<"$(az vm list-usage -l "$AKS_LOC" \
      --query "[?name.value=='$vm_family'].[currentValue, limit]" -o tsv 2>/dev/null)"
    if [[ -z "$limit_val" ]]; then
      note "could not read quota for family '$vm_family' in $AKS_LOC"
    else
      available_vcpus=$(( limit_val - current_val ))
      if [[ $available_vcpus -ge $required_vcpus ]]; then
        ok "quota OK: $vm_family has $available_vcpus/$limit_val vCPUs free in $AKS_LOC, need $required_vcpus vCPUs ($AKS_NODE_MIN_COUNT system nodes + 1 gitrestpool)"
      else
        fail "quota SHORTFALL: $vm_family only has $available_vcpus/$limit_val vCPUs free in $AKS_LOC, need $required_vcpus vCPUs ($AKS_NODE_MIN_COUNT system nodes + 1 gitrestpool) -- request a quota increase or pick a smaller VM size/region"
      fi
    fi
  fi

  # Zones have NO runtime fallback in deploy.sh (unlike Redis/Cosmos/Storage below, which all
  # catch a zone/SKU-related create failure and retry non-zonal) -- `az aks create --zones`
  # fails outright, aborting the whole deploy.sh run under `set -euo pipefail`. Worth catching
  # here in seconds rather than after everything up to phase1_aks has already run.
  if [[ -z "$AKS_ZONES" ]]; then
    note "aks.availabilityZones is empty -- deploy.sh will create a non-zonal system pool, skipping zone-support check"
  else
    # locationInfo[].zones alone is NOT enough -- it lists every zone the SKU can exist in
    # ANYWHERE in the region, but a specific subscription can be excluded from a subset of
    # those via `restrictions` (reasonCode NotAvailableForSubscription), which az aks create
    # then rejects with (AvailabilityZoneNotSupported) at create time. Subtract those before
    # comparing, or this check reports zones as available when AKS itself will reject them.
    vm_zones="$(az vm list-skus --location "$AKS_LOC" --size "$AKS_NODE_VM_SIZE" -o json 2>/dev/null | \
      jq -r --arg size "$AKS_NODE_VM_SIZE" '
        .[] | select(.name == $size) |
        (.locationInfo[0].zones // []) as $all |
        ([.restrictions[]? | select(.type=="Zone") | .restrictionInfo.zones[]?]) as $restricted |
        ($all - $restricted)[]
      ' 2>/dev/null | tr '\n' ' ')"
    if [[ -z "$vm_zones" ]]; then
      note "'$AKS_NODE_VM_SIZE' in $AKS_LOC reports no zone support -- aks.availabilityZones ($AKS_ZONES) would fail at create time with no fallback; set it to an empty array or adjust region/VM size"
    else
      missing_zones=""
      for z in $AKS_ZONES; do
        grep -qw "$z" <<<"$vm_zones" || missing_zones="$missing_zones $z"
      done
      if [[ -n "$missing_zones" ]]; then
        fail "'$AKS_NODE_VM_SIZE' in $AKS_LOC does not support zone(s):$missing_zones (only supports: $vm_zones) -- aks.availabilityZones would fail at create time with no fallback; adjust aks.availabilityZones or pick a different region/VM size"
      else
        ok "'$AKS_NODE_VM_SIZE' in $AKS_LOC supports all requested zones ($AKS_ZONES)"
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Cosmos DB region availability -- Azure regions don't all support Cosmos DB, and per-
# subscription access can be further restricted (e.g., preview/limited regions), same idea
# for Availability Zone support specifically when cosmos.zoneRedundant=True. Neither check has
# a runtime fallback in deploy.sh: `az cosmosdb create` in an unsupported region/zone
# configuration just fails outright, and the customer picks a different region (or, for the AZ
# case, sets cosmos.zoneRedundant to False) themselves rather than have deploy.sh silently
# reroute or downgrade behind their back. Worth catching here in seconds rather than after
# Phase 8 has already run.
# ---------------------------------------------------------------------------
banner "Cosmos DB region availability ($RG_LOC)"
if az cosmosdb show -n "$COSMOS" -g "$RG" >/dev/null 2>&1; then
  ok "Cosmos DB account '$COSMOS' already exists in target RG $RG -- deploy.sh will reuse it (skipping region-availability check)"
else
  cosmos_sub_id="$(az account show --query id -o tsv)"
  cosmos_all_locs="$(az rest --method get \
    --url "https://management.azure.com/subscriptions/$cosmos_sub_id/providers/Microsoft.DocumentDB/locations?api-version=2025-10-15" \
    -o json 2>/dev/null)"
  if [[ -z "$cosmos_all_locs" ]] || ! jq -e '.value' >/dev/null 2>&1 <<<"$cosmos_all_locs"; then
    note "could not query Cosmos DB region availability for $RG_LOC (API call failed)"
  else
    # `.name` is a display name ("Central US"), not the normalized region code -- the
    # normalized code this API actually keys locations by is the last path segment of `.id`
    # (".../locations/centralus"). Matching against `.name` directly can never succeed for any
    # region, since RG_LOC is always a normalized code.
    cosmos_loc_json="$(jq -c --arg loc "$RG_LOC" '.value[] | select((.id | split("/") | last) == $loc)' <<<"$cosmos_all_locs")"
    if [[ -z "$cosmos_loc_json" ]]; then
      fail "Cosmos DB is not available in $RG_LOC at all (region not found in Microsoft.DocumentDB's own location list) -- pick a different region"
    else
      cosmos_status="$(jq -r '.properties.status // empty' <<<"$cosmos_loc_json")"
      cosmos_regular_ok="$(jq -r '.properties.isSubscriptionRegionAccessAllowedForRegular // empty' <<<"$cosmos_loc_json")"
      if [[ "$cosmos_status" != "Online" || "$cosmos_regular_ok" != "true" ]]; then
        fail "Cosmos DB is not available for this subscription in $RG_LOC (status='$cosmos_status', subscription access allowed='$cosmos_regular_ok') -- pick a different region"
      else
        ok "Cosmos DB is available in $RG_LOC for this subscription"
        if [[ "$(tr '[:upper:]' '[:lower:]' <<<"$COSMOS_ZONE_REDUNDANT")" == "true" ]]; then
          cosmos_supports_az="$(jq -r '.properties.supportsAvailabilityZone // empty' <<<"$cosmos_loc_json")"
          cosmos_az_ok="$(jq -r '.properties.isSubscriptionRegionAccessAllowedForAz // empty' <<<"$cosmos_loc_json")"
          if [[ "$cosmos_supports_az" == "true" && "$cosmos_az_ok" == "true" ]]; then
            ok "$RG_LOC supports Cosmos DB Availability Zones -- cosmos.zoneRedundant=True is valid"
          else
            fail "$RG_LOC does NOT support Cosmos DB Availability Zones for this subscription -- cosmos.zoneRedundant=True would fail at create time with no fallback; set cosmos.zoneRedundant to False in your parameters file, or pick a different region"
          fi
          unset cosmos_supports_az cosmos_az_ok
        fi
      fi
      unset cosmos_status cosmos_regular_ok
    fi
    unset cosmos_loc_json
  fi
  unset cosmos_sub_id cosmos_all_locs
fi

# ---------------------------------------------------------------------------
# Azure Front Door profile count quota
# ---------------------------------------------------------------------------
banner "Azure Front Door profile count quota"
if az afd profile show -g "$RG" --profile-name "$AFD" >/dev/null 2>&1; then
  ok "Front Door profile '$AFD' already exists in target RG $RG -- deploy.sh will reuse it (skipping quota check)"
else
  afd_sub_id="$(az account show --query id -o tsv)"
  afd_resp="$(az rest --method post \
    --url "https://management.azure.com/subscriptions/$afd_sub_id/providers/Microsoft.Cdn/checkResourceUsage?api-version=2026-04-01-preview" \
    2>/tmp/afd_quota_err.$$)"
  read -r afd_current afd_limit <<<"$(jq -r '.value[]? | select(.resourceType=="afdprofile") | "\(.currentValue) \(.limit)"' <<<"$afd_resp" 2>/dev/null)"
  if [[ -z "$afd_limit" ]]; then
    note "could not read Front Door profile quota ($(head -1 /tmp/afd_quota_err.$$ 2>/dev/null))"
  elif [[ $afd_current -lt $afd_limit ]]; then
    ok "quota OK: $afd_current/$afd_limit Azure Front Door (Standard/Premium) profiles used"
  else
    fail "quota SHORTFALL: $afd_current/$afd_limit Azure Front Door profiles already used -- request a quota increase or delete unused profiles"
  fi
  rm -f /tmp/afd_quota_err.$$
  unset afd_resp afd_sub_id
fi

# ---------------------------------------------------------------------------
# Helm chart rendering (local-only; does not require a live cluster) -- catches
# values/template errors before a real `helm install` against a freshly-built AKS cluster.
# Uses placeholder values for the sed substitutions deploy.sh normally does at deploy time.
# ---------------------------------------------------------------------------
banner "Helm chart template rendering"
FLUID_ROOT="${FLUID_REPO_DIR:-$SELFHOST_ROOT/.fluidframework}"
CHART_DIR="$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious"
if [[ ! -d "$CHART_DIR" ]]; then
  note "FluidFramework checkout not found at $FLUID_ROOT -- skipping Helm template check (deploy.sh clones it fresh if needed)"
else
  tmp_values="$(mktemp)"
  sed -e "s|<ACR>|placeholderacr|g" -e "s|<IMAGE_TAG>|placeholder-tag|g" \
      -e "s|<REDIS_HOSTNAME>|placeholder.eastus.redis.azure.net|g" \
      "$SELFHOST_ROOT/azure/routerlicious-values.yaml" > "$tmp_values"
  if helm template fluid "$CHART_DIR" -f "$tmp_values" >/tmp/helm_template_out.$$ 2>/tmp/helm_template_err.$$; then
    ok "helm template rendered successfully ($(wc -l </tmp/helm_template_out.$$ | tr -d ' ') lines of manifests)"
  else
    fail "helm template failed to render -- see errors below"
    sed 's/^/    /' /tmp/helm_template_err.$$ >&2
  fi
  rm -f "$tmp_values" /tmp/helm_template_out.$$ /tmp/helm_template_err.$$
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
banner "Preflight summary"
if [[ $FAILURES -eq 0 ]]; then
  log "All preflight checks passed -- safe to run azure/deploy.sh against $RG"
  exit 0
else
  log "$FAILURES preflight check(s) FAILED -- fix these before running azure/deploy.sh"
  exit 1
fi
