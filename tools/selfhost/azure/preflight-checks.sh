#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Read-only provider checks, sourced by preflight-check.sh.

check_aks_zones() {
  if [[ -z "$AKS_ZONES" ]]; then
    note "aks.availabilityZones is empty -- creating a non-zonal pool"
    return
  fi
  local skus zones missing="" z
  if ! skus="$(az vm list-skus --location "$AKS_LOC" --size "$AKS_NODE_VM_SIZE" \
      --resource-type virtualMachines --all --subscription "$SUB" -o json)"; then
    fail "could not query zone availability for $AKS_NODE_VM_SIZE in $AKS_LOC"
    return
  fi
  if ! zones="$(jq -r --arg size "$AKS_NODE_VM_SIZE" --arg loc "$AKS_LOC" '
    def in_region:
      (.restrictionInfo.locations // .values // []) as $locations |
      ($locations | length) == 0 or ($locations | map(ascii_downcase) | index($loc)) != null;
    [.[] | select(.name == $size)][0] as $sku |
    if $sku == null or any($sku.restrictions[]?; .type == "Location" and in_region) then []
    else
      ([$sku.locationInfo[]? | select((.location | ascii_downcase) == $loc) | .zones[]?] -
       [$sku.restrictions[]? | select(.type == "Zone" and in_region) | .restrictionInfo.zones[]?])
    end | unique[]
  ' <<<"$skus")"; then
    fail "could not parse zone availability for $AKS_NODE_VM_SIZE in $AKS_LOC"
    return
  fi
  for z in $AKS_ZONES; do
    grep -qxF "$z" <<<"$zones" || missing="$missing $z"
  done
  if [[ -n "$missing" ]]; then
    fail "$AKS_NODE_VM_SIZE in $AKS_LOC does not support requested zone(s):$missing (available: ${zones:-none}); set aks.availabilityZones to [] or choose a supported region/VM size"
  else
    ok "$AKS_NODE_VM_SIZE in $AKS_LOC supports all requested zones ($AKS_ZONES)"
  fi
}

check_redis_capacity() {
  local group_exists caches
  if ! group_exists="$(az group exists -n "$RG" --subscription "$SUB" -o tsv)"; then
    fail "could not check resource group $RG before Redis capacity validation"
    return
  fi
  if [[ "$group_exists" == false ]]; then
    note "Redis capacity was NOT validated: resource group $RG does not exist yet. Deployment preflight repeats this check after the build registry creates the group."
    return
  fi
  if [[ "$group_exists" != true ]]; then
    fail "resource group existence check returned an invalid response before Redis validation"
    return
  fi
  if ! caches="$(az redisenterprise list -g "$RG" --subscription "$SUB" -o json)"; then
    fail "could not list Azure Managed Redis resources in $RG before capacity validation"
    return
  fi
  if ! jq -e 'type == "array"' <<<"$caches" >/dev/null; then
    fail "Azure Managed Redis list returned an invalid response before capacity validation"
    return
  fi
  if jq -e --arg name "$REDIS" 'any(.[]; .name == $name)' <<<"$caches" >/dev/null; then
    note "Azure Managed Redis already exists -- skipping new-allocation validation"
    return
  fi
  local request="$PREFLIGHT_TEMP_DIR/redis-validation.json"
  local response="$PREFLIGHT_TEMP_DIR/redis-validation-response.json"
  local errors="$PREFLIGHT_TEMP_DIR/redis-validation.err"
  local validated=true
  jq -n --arg name "$REDIS" --arg location "$REDIS_LOC" --arg sku "$REDIS_SKU" \
    --arg ha "$REDIS_HIGH_AVAILABILITY" '{
    properties: {
      mode: "Incremental", validationLevel: "Provider",
      template: {
        "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
        contentVersion: "1.0.0.0",
        resources: [{
          type: "Microsoft.Cache/redisEnterprise", apiVersion: "2025-07-01",
          name: $name, location: $location, sku: {name: $sku},
          properties: {highAvailability: $ha, minimumTlsVersion: "1.2", publicNetworkAccess: "Disabled"}
        }]
      }
    }
  }' > "$request"
  az rest --method post \
      --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Resources/deployments/selfhost-redis-preflight/validate?api-version=2025-04-01" \
      --body "@$request" -o json >"$response" 2>"$errors" || validated=false
  if [[ "$validated" == true ]] && ! grep -q '[^[:space:]]' "$response"; then
    # HTTP 202 has no result body. Let the deployment CLI poll a validation to completion.
    note "Redis validation is asynchronous -- waiting for a completed provider check"
    jq '.properties.template' "$request" > "$PREFLIGHT_TEMP_DIR/redis-template.json"
    az deployment group validate --subscription "$SUB" --resource-group "$RG" \
      --name selfhost-redis-preflight --validation-level Provider \
      --template-file "$PREFLIGHT_TEMP_DIR/redis-template.json" \
      -o json >"$response" 2>"$errors" || validated=false
  fi
  if [[ "$validated" != true ]]; then
    fail "Redis provider validation failed for $REDIS_SKU in $REDIS_LOC; check capacity, permissions, and policy below. Select a different redis.sku or redis.location if capacity is unavailable."
    cat "$errors" >&2
  elif ! jq -e 'type == "object" and .error == null and (.properties | type == "object") and
      .properties.error == null and (.properties.provisioningState == null or .properties.provisioningState == "Succeeded")' "$response" >/dev/null; then
    fail "Redis provider validation returned an error or invalid response for $REDIS_SKU in $REDIS_LOC"
    cat "$response" >&2
  else
    ok "Redis provider validation passed for $REDIS_SKU in $REDIS_LOC (point-in-time check, not a capacity reservation)"
  fi
}
