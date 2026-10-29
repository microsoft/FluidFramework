#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
    echo "Usage: bash azure/migrate-redis.sh <existing-release-id> <source-cache-parameters.json> <target-managed-parameters.json> --yes"
    echo "Creates AMR, then stops all eight workloads for a cold-cache cutover. Redis-only data is NOT copied. Neither cache is deleted."
    exit 0
  fi
  if [[ $# != 4 || "$4" != --yes ]]; then
    echo "ERROR: a maintenance window and --yes are required. Run with --help for usage." >&2
    exit 1
  fi
  exec bash "$(dirname "$0")/deploy.sh" --mode migrate-redis \
    --redis-source-parameters "$2" --confirm-redis-migration "$1" "$3"
fi

validate_redis_migration_workloads() {
  local source_hostname="$1" deployments_file="$2"
  jq -e --arg host "$source_hostname" --arg registry "$ACR.azurecr.io" \
    --slurpfile release "$IMAGES_FILE" '
    (.items | length) == 8 and
    all(.items[]; (.spec.selector.matchLabels | length) > 0) and
    all(.items[];
      (.metadata.name | if startswith("fluid-") then "routerlicious" else . end) as $component |
      [$release[0].builtImages[]? | select(.name == $component and .status == "pinned")] as $images |
      ($images | length) == 1 and
      any(.spec.template.spec.containers[];
        (($images[0].tag | type) == "string" and ($images[0].tag | length) > 0 and
          .image == ($registry + "/" + $component + ":" + $images[0].tag)) or
        (($images[0].digest // "" | test("^sha256:[0-9a-f]{64}$")) and
          .image == ($registry + "/" + $component + "@" + $images[0].digest)))) and
    any(.items[]; .metadata.name == "gitrest" and
      any(.spec.template.spec.containers[].env[]?; .name == "redis__host" and .value == $host))
  ' "$deployments_file" >/dev/null || {
    echo "ERROR: running workloads do not match the source cache and existing release. Check all eight workload images against images.json in the currently deployed release bundle and verify the source Redis hostname." >&2
    return 1
  }
}

stop_redis_workloads() {
  local name selector
  kubectl scale deployment "${REDIS_MIGRATION_DEPLOYMENTS[@]}" --replicas=0 || return 1
  for name in "${REDIS_MIGRATION_DEPLOYMENTS[@]}"; do
    selector="$(jq -r --arg name "$name" '
      .items[] | select(.metadata.name == $name) | .spec.selector.matchLabels |
      to_entries | map(.key + "=" + .value) | join(",")
    ' "$DEPLOY_DIR/redis-source-deployments.json")" || return 1
    [[ -n "$selector" ]] || { echo "ERROR: no pod selector for $name." >&2; return 1; }
    if ! kubectl wait --for=delete pod --selector "$selector" --timeout=300s; then
      echo "WARNING: pod deletion wait failed for $name; verifying the current pod list." >&2
    fi
    if ! kubectl get pods --selector "$selector" -o json |
        jq -e '(.items | type) == "array" and (.items | length) == 0' >/dev/null; then
      echo "ERROR: cannot confirm all $name pods are gone; refusing to switch Redis credentials." >&2
      return 1
    fi
  done
}

probe_managed_redis() {
  local key attempt probe_input="$DEPLOY_DIR/redis-probe.json"
  key="$(az redisenterprise database list-keys --cluster-name "$REDIS" -g "$RG" --query primaryKey -o tsv)"
  [[ -n "$key" ]] || { echo "ERROR: AMR returned no access key." >&2; return 1; }
  SENSITIVE_TEMP_FILES+=("$probe_input")
  (umask 077; printf '%s' "$key" | jq -Rs --arg host "$REDIS_HOSTNAME" \
    --argjson port "$REDIS_PORT" '{host: $host, port: $port, password: .}' > "$probe_input")
  unset key
  # Authenticate over TLS from the existing AKS workload without putting a key in argv or a pod spec.
  for attempt in {1..6}; do
    if kubectl exec -i deployment/gitrest -- node -e '
    const tls = require("node:tls");
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const {host, port, password} = JSON.parse(input);
      const socket = tls.connect({host, port, servername: host, rejectUnauthorized: true});
      const fail = () => { console.error("AMR TLS/AUTH/PING probe failed"); socket.destroy(); process.exit(1); };
      socket.setTimeout(15000, fail);
      socket.on("error", fail);
      let reply = "";
      socket.on("secureConnect", () => {
        socket.write("*2\r\n$4\r\nAUTH\r\n$" + Buffer.byteLength(password) + "\r\n" + password + "\r\n*1\r\n$4\r\nPING\r\n");
      });
      socket.on("data", chunk => {
        reply += chunk.toString();
        if (reply.startsWith("-") || reply.includes("\r\n-")) fail();
        else if (reply === "+OK\r\n+PONG\r\n") socket.end();
      });
      socket.on("end", () => {
        if (reply !== "+OK\r\n+PONG\r\n") fail();
        else console.log("AMR TLS/AUTH/PING probe passed");
      });
      socket.on("close", () => { if (reply !== "+OK\r\n+PONG\r\n") fail(); });
    });
    ' < "$probe_input"; then
      rm -f "$probe_input"
      return 0
    fi
    if [[ "$attempt" -lt 6 ]]; then
      log "AMR connectivity probe failed; retrying after private DNS propagation (attempt $attempt/6)."
      sleep 5
    fi
  done
  rm -f "$probe_input"
  echo "ERROR: AMR TLS/AUTH/PING probe failed from AKS; existing workloads and credentials were not switched." >&2
  return 1
}

migrate_redis() {
  [[ "$REDIS_SERVICE" == managed ]] || { echo "ERROR: target redis.useDeprecated must be false or omitted." >&2; return 1; }
  (load_redis_config "$REDIS_SOURCE_PARAMS" && [[ "$REDIS_SERVICE" == cache ]]) ||
    { echo "ERROR: source redis.useDeprecated must be true." >&2; return 1; }
  if ! cmp -s <(jq -S 'del(.redis)' "$REDIS_SOURCE_PARAMS") <(jq -S 'del(.redis)' "$PARAMS_FILE"); then
    echo "ERROR: source and target parameters must differ only in the redis block." >&2
    return 1
  fi
  local source_name source_hostname target_caches target_cache target_id
  source_name="$(jq -r '.redis.clusterName' "$REDIS_SOURCE_PARAMS")"
  [[ "$source_name" != "$REDIS" ]] || { echo "ERROR: choose a different AMR clusterName; the source cache is retained." >&2; return 1; }
  bash "$SELFHOST_ROOT/azure/validate-names.sh" "$PARAMS_FILE"
  [[ "$(az group exists -n "$RG" --subscription "$SUB" -o tsv)" == true ]] ||
    { echo "ERROR: migration requires an existing deployment resource group." >&2; return 1; }
  [[ "$(az redis show -n "$source_name" -g "$RG" --query provisioningState -o tsv)" == Succeeded ]] ||
    { echo "ERROR: source Azure Cache for Redis is not provisioned successfully." >&2; return 1; }
  source_hostname="$(az redis show -n "$source_name" -g "$RG" --query hostName -o tsv)"
  [[ -n "$source_hostname" ]] || { echo "ERROR: source Azure Cache for Redis returned no hostname." >&2; return 1; }
  target_caches="$(az redisenterprise list -g "$RG" --subscription "$SUB" -o json)"
  target_cache="$(jq -c --arg name "$REDIS" '
    if type == "array" then [.[] | select(.name == $name)][0]
    else error("Expected an Azure Managed Redis resource list") end
  ' <<<"$target_caches")" || return 1
  if [[ "$target_cache" != null ]]; then
    if ! jq -e '((.tags // {}) | has("selfhostRedisMigrationCutover")) | not' <<<"$target_cache" >/dev/null; then
      echo "ERROR: this AMR target has already entered cutover. Use the previous redis-migration-recovery.txt instructions to finish or roll back; do not restart migration." >&2
      return 1
    fi
    if ! jq -e --arg location "$REDIS_LOC" --arg sku "$REDIS_SKU" --arg ha "$REDIS_HIGH_AVAILABILITY" '
      (.location | ascii_downcase | gsub(" "; "")) == ($location | ascii_downcase | gsub(" "; "")) and
      .sku.name == $sku and .highAvailability == $ha and .publicNetworkAccess == "Disabled"
    ' <<<"$target_cache" >/dev/null; then
      echo "ERROR: existing AMR target does not match the requested region, SKU, high availability, and disabled public access. Resolve it explicitly or choose a new target name." >&2
      return 1
    fi
    log "Reusing existing AMR target $REDIS; its database and private endpoint will be verified before cutover."
  fi

  local FAILURES=0 PREFLIGHT_TEMP_DIR="$DEPLOY_DIR"
  fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES + 1)); }
  note() { log "$*"; }
  ok() { log "$*"; }
  . "$SELFHOST_ROOT/azure/preflight-helpers.sh"
  if [[ "$target_cache" == null ]]; then
    check_redis_capacity
  else
    log "AMR target already exists; skipping the creation-capacity check."
  fi
  [[ "$FAILURES" == 0 ]] || return 1

  az aks get-credentials -g "$RG" -n "$AKS" --overwrite-existing
  REDIS_MIGRATION_DEPLOYMENTS=(fluid-alfred fluid-nexus fluid-riddler fluid-deli fluid-scribe fluid-scriptorium gitrest historian)
  kubectl get deployments "${REDIS_MIGRATION_DEPLOYMENTS[@]}" -o json > "$DEPLOY_DIR/redis-source-deployments.json"
  validate_redis_migration_workloads "$source_hostname" "$DEPLOY_DIR/redis-source-deployments.json" || return 1
  if ! jq -e 'all(.items[]; (.spec.replicas // 1) > 0)' "$DEPLOY_DIR/redis-source-deployments.json" >/dev/null; then
    echo "ERROR: source workloads are stopped. Use the previous redis-migration-recovery.txt instructions instead of restarting migration." >&2
    return 1
  fi
  PE_SUBNET_ID="$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n pe-subnet --query id -o tsv)"
  [[ -n "$PE_SUBNET_ID" ]] || { echo "ERROR: existing private-endpoint subnet was not found." >&2; return 1; }

  provision_managed_redis
  initialize_deploy_only_mode
  probe_managed_redis
  # Resolve permissions and save the old secret version before the maintenance window.
  phase8_keyvault
  local source_secret_id
  source_secret_id="$(az keyvault secret show --vault-name "$KV" --name redis-password --query id -o tsv)"
  [[ -n "$source_secret_id" ]] || { echo "ERROR: source Redis secret version was not found." >&2; return 1; }
  cat > "$DEPLOY_DIR/redis-migration-recovery.txt" <<EOF
Source cache: $source_name
Target AMR: $REDIS
Original redis-password secret version (no credential value): $source_secret_id
Source parameters: $REDIS_SOURCE_PARAMS
Target parameters: $PARAMS_FILE
Workload snapshot: $DEPLOY_DIR/redis-source-deployments.json

If cutover fails, all eight deployments are scaled to zero to prevent split Pub/Sub state.
Before recovery, confirm all eight deployments have zero replicas and their pods have disappeared.
If cleanup reported a stop/wait failure, stop and wait for those pods manually before proceeding.
Do not run deployments or autoscaler maintenance concurrently with this migration.
To finish the cutover, run from tools/selfhost:
  bash azure/deploy.sh --mode full "$RELEASE_ID" "$PARAMS_FILE"
To roll back, run from tools/selfhost:
  bash azure/deploy.sh --mode full "$RELEASE_ID" "$REDIS_SOURCE_PARAMS"
Full mode republishes the selected cache's key and endpoints; deploy-only does not repair keys.
Do not delete either cache until application validation succeeds.
EOF
  target_id="$(az redisenterprise show -n "$REDIS" -g "$RG" --query id -o tsv)"
  [[ -n "$target_id" ]] || { echo "ERROR: AMR returned no resource ID; refusing to start cutover." >&2; return 1; }
  # Persist the recovery boundary in Azure before stopping consumers, including across machines.
  az tag update --resource-id "$target_id" --operation Merge \
    --tags "selfhostRedisMigrationCutover=$RELEASE_ID" >/dev/null
  log "Starting maintenance window: stopping all eight workloads; Redis data is NOT copied."
  REDIS_MIGRATION_STOPPED=true
  stop_redis_workloads
  publish_redis_secret
  phase8_keyvault_lockdown
  phase4_secrets_infra
  phase4_backends
  phase5_helm
  phase10_hpa
  publish_frontdoor_hostnames
  local deployment
  for deployment in "${REDIS_MIGRATION_DEPLOYMENTS[@]}"; do
    kubectl rollout status "deployment/$deployment" --timeout=300s
  done
  verify_frontdoor_origin_health
  REDIS_MIGRATION_STOPPED=false
  log "Redis cutover complete. Use $PARAMS_FILE for ALL future deployments."
  log "Validate document reads/writes, live collaboration, reconnects and logs before manually deleting Azure Cache for Redis '$source_name'."
  log "Neither Redis resource was deleted. Recovery details: $DEPLOY_DIR/redis-migration-recovery.txt"
}
