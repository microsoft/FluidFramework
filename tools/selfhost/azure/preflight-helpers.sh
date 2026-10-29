#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Read-only Azure provider checks, sourced by preflight-check.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/redis-helpers.sh"

check_aks_capacity() {
  local skus vm_family vcpus_per_node required_vcpus current_val limit_val available_vcpus
  note "Querying VM SKU information once for quota and zone checks"
  if ! skus="$(az vm list-skus --location "$AKS_LOC" --size "$AKS_NODE_VM_SIZE" \
      --resource-type virtualMachines --all --subscription "$SUB" -o json)"; then
    fail "could not query VM SKU information for $AKS_NODE_VM_SIZE in $AKS_LOC"
    return
  fi
  if ! jq -e 'type == "array" and all(.[]; type == "object")' <<<"$skus" >/dev/null; then
    fail "could not parse VM SKU information for $AKS_NODE_VM_SIZE in $AKS_LOC"
    return
  fi
  vm_family="$(jq -r --arg size "$AKS_NODE_VM_SIZE" '[.[] | select(.name == $size)][0].family // empty' <<<"$skus")"
  vcpus_per_node="$(jq -r --arg size "$AKS_NODE_VM_SIZE" '
    [.[] | select(.name == $size)][0] | [.capabilities[]? | select(.name == "vCPUs")][0].value // empty
  ' <<<"$skus")"
  if [[ -z "$vm_family" || ! "$vcpus_per_node" =~ ^[1-9][0-9]*$ ]]; then
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
  check_aks_zones "$skus"
}

check_aks_zones() {
  if [[ -z "$AKS_ZONES" ]]; then
    note "aks.availabilityZones is empty -- creating a non-zonal pool"
    return
  fi
  local skus="$1" zones missing="" z
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
  redis_service_metadata || { fail "invalid Redis service"; return; }
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
  if ! caches="$(az "$REDIS_CLI" list -g "$RG" --subscription "$SUB" -o json)"; then
    fail "could not list $REDIS_LABEL resources in $RG before capacity validation"
    return
  fi
  if ! jq -e 'type == "array"' <<<"$caches" >/dev/null; then
    fail "$REDIS_LABEL list returned an invalid response before capacity validation"
    return
  fi
  if jq -e --arg name "$REDIS" 'any(.[]; .name == $name)' <<<"$caches" >/dev/null; then
    note "$REDIS_LABEL already exists -- skipping new-allocation validation"
    return
  fi
  local request="$PREFLIGHT_TEMP_DIR/redis-validation.json"
  local response="$PREFLIGHT_TEMP_DIR/redis-validation-response.json"
  local errors="$PREFLIGHT_TEMP_DIR/redis-validation.err"
  local validated=true
  if ! write_redis_template "$PREFLIGHT_TEMP_DIR/redis-template.json" ||
      ! jq '{properties: {mode: "Incremental", validationLevel: "Provider", template: .}}' \
        "$PREFLIGHT_TEMP_DIR/redis-template.json" > "$request"; then
    fail "could not build Redis provider validation template"
    return
  fi
  az rest --method post \
      --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Resources/deployments/selfhost-redis-preflight/validate?api-version=2025-04-01" \
      --body "@$request" -o json >"$response" 2>"$errors" || validated=false
  if [[ "$validated" == true ]] && ! grep -q '[^[:space:]]' "$response"; then
    # HTTP 202 has no result body. Let the deployment CLI poll a validation to completion.
    note "Redis validation is asynchronous -- waiting for a completed provider check"
    az deployment group validate --subscription "$SUB" --resource-group "$RG" \
      --name selfhost-redis-preflight --validation-level Provider \
      --template-file "$PREFLIGHT_TEMP_DIR/redis-template.json" \
      -o json >"$response" 2>"$errors" || validated=false
  fi
  if [[ "$validated" != true ]]; then
    fail "Redis provider validation failed for $REDIS_SKU in $REDIS_LOC; check capacity, permissions, and policy below. $(redis_capacity_advice)"
    cat "$errors" >&2
  elif ! jq -e 'type == "object" and .error == null and (.properties | type == "object") and
      .properties.error == null and (.properties.provisioningState == null or .properties.provisioningState == "Succeeded")' "$response" >/dev/null; then
    fail "Redis provider validation returned an error or invalid response for $REDIS_SKU in $REDIS_LOC. $(redis_capacity_advice)"
    cat "$response" >&2
  else
    ok "Redis provider validation passed for $REDIS_SKU in $REDIS_LOC (point-in-time check, not a capacity reservation)"
  fi
}
