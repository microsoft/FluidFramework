#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

redis_service_metadata() {
  case "${REDIS_SERVICE:-managed}" in
    managed)
      REDIS_SERVICE=managed
      REDIS_LABEL="Azure Managed Redis"
      REDIS_CLI=redisenterprise
      REDIS_PORT=10000
      REDIS_PE_GROUP=redisEnterprise
      REDIS_DNS_ZONE=privatelink.redis.azure.net
      ;;
    cache)
      REDIS_LABEL="Azure Cache for Redis"
      REDIS_CLI=redis
      REDIS_PORT=6380
      REDIS_PE_GROUP=redisCache
      REDIS_DNS_ZONE=privatelink.redis.cache.windows.net
      ;;
    *)
      echo "ERROR: unsupported Redis service '$REDIS_SERVICE'." >&2
      return 1
      ;;
  esac
}

load_redis_config() {
  local params="$1"
  if ! jq -e '
      if (.redis | type) != "object" then false else
        (.redis | [.clusterName, .location, .sku, .highAvailability] |
          all(. == null or type == "string")) and
        (if .redis.capacity == null then true else
          .redis.capacity | if type == "number" then . == floor else false end
        end)
      end
    ' "$params" >/dev/null; then
    echo "ERROR: redis must be an object with string settings and an integer capacity." >&2
    return 1
  fi
  if ! jq -e '.redis | if has("useDeprecated") then (.useDeprecated | type) == "boolean" else true end' "$params" >/dev/null; then
    echo "ERROR: redis.useDeprecated must be a boolean (true or false); omitted defaults to false." >&2
    return 1
  fi
  REDIS_SERVICE="$(jq -r 'if .redis.useDeprecated == true then "cache" else "managed" end' "$params")" || return 1
  redis_service_metadata || return 1
  REDIS="$(jq -r '.redis.clusterName // empty' "$params")" || return 1
  REDIS_LOC="$(jq -r 'if (.redis.location // "") == "" then .location else .redis.location end' "$params")" || return 1
  REDIS_HIGH_AVAILABILITY="$(jq -r '.redis.highAvailability // empty' "$params")" || return 1
  if [[ "$REDIS_SERVICE" == managed ]]; then
    REDIS_SKU="$(jq -r '.redis.sku // "Balanced_B5"' "$params")" || return 1
    if [[ "$REDIS_SKU" != *_* ]]; then
      echo "ERROR: redis.sku must be an Azure Managed Redis SKU, for example Balanced_B5." >&2
      return 1
    fi
    if [[ "$REDIS_HIGH_AVAILABILITY" != Enabled && "$REDIS_HIGH_AVAILABILITY" != Disabled ]]; then
      echo "ERROR: redis.highAvailability must be exactly 'Enabled' or 'Disabled'." >&2
      return 1
    fi
  else
    REDIS_SKU="$(jq -r '.redis.sku // "Premium"' "$params")" || return 1
    REDIS_CAPACITY="$(jq -r 'if .redis.capacity == null then 1 else .redis.capacity end' "$params")" || return 1
    case "$REDIS_SKU:$REDIS_CAPACITY" in
      Premium:[1-5]|Standard:[0-6]) ;;
      *)
        echo "ERROR: redis.useDeprecated=true requires redis.sku=Premium with capacity 1-5, or Standard with capacity 0-6." >&2
        return 1
        ;;
    esac
  fi
  if ! jq -e '[(.redis // {} | keys[]) | select(
      . == "service" or . == "vmSize" or . == "version" or . == "replicasPerMaster" or . == "zones"
    )] | length == 0' "$params" >/dev/null; then
    echo "ERROR: removed Redis parameters found; use redis.useDeprecated, sku, capacity (cache only), and highAvailability (managed only)." >&2
    return 1
  fi
}

write_redis_template() {
  local destination="$1"
  redis_service_metadata || return 1
  if [[ "$REDIS_SERVICE" == managed ]]; then
    jq -n --arg name "$REDIS" --arg location "$REDIS_LOC" --arg sku "$REDIS_SKU" \
      --arg ha "$REDIS_HIGH_AVAILABILITY" '{
      "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
      contentVersion: "1.0.0.0",
      resources: [{
        type: "Microsoft.Cache/redisEnterprise", apiVersion: "2025-07-01",
        name: $name, location: $location, sku: {name: $sku},
        properties: {highAvailability: $ha, minimumTlsVersion: "1.2", publicNetworkAccess: "Disabled"}
      }]
    }' > "$destination"
  else
    jq -n --arg name "$REDIS" --arg location "$REDIS_LOC" --arg sku "$REDIS_SKU" \
      --argjson capacity "$REDIS_CAPACITY" '{
      "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
      contentVersion: "1.0.0.0",
      resources: [{
        type: "Microsoft.Cache/Redis", apiVersion: "2024-11-01",
        name: $name, location: $location,
        properties: {
          sku: {name: $sku, family: (if $sku == "Premium" then "P" else "C" end), capacity: $capacity},
          redisVersion: "6", minimumTlsVersion: "1.2",
          enableNonSslPort: false, publicNetworkAccess: "Disabled",
          redisConfiguration: {"maxmemory-policy": "volatile-lru"}
        }
      }]
    }' > "$destination"
  fi
}

redis_capacity_advice() {
  if [[ "${REDIS_SERVICE:-managed}" == managed ]]; then
    echo "Try a different redis.location / redis.sku, or set redis.useDeprecated=true to use Azure Cache for Redis (subject to eligibility and retirement)."
  else
    echo "Try a different redis.location / redis.sku / redis.capacity; check Azure Cache for Redis creation eligibility and retirement."
  fi
}

resolve_redis_hostname() {
  REDIS_HOSTNAME="$(az "$REDIS_CLI" show -n "$REDIS" -g "$RG" --query hostName -o tsv)" || return 1
  [[ -n "$REDIS_HOSTNAME" ]] || { echo "ERROR: $REDIS_LABEL '$REDIS' returned no hostname." >&2; return 1; }
}

publish_redis_secret() {
  local redis_key
  if [[ "$REDIS_SERVICE" == managed ]]; then
    redis_key="$(az redisenterprise database list-keys --cluster-name "$REDIS" -g "$RG" --query primaryKey -o tsv)" || return 1
  else
    redis_key="$(az redis list-keys -n "$REDIS" -g "$RG" --query primaryKey -o tsv)" || return 1
  fi
  [[ -n "$redis_key" ]] || { echo "ERROR: $REDIS_LABEL returned no access key." >&2; return 1; }
  keyvault_secret_set_with_retry "$KV" redis-password "$redis_key" || return 1
  unset redis_key
  az keyvault secret show --vault-name "$KV" --name redis-password --query id -o tsv >/dev/null
}
