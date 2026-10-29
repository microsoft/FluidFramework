#!/usr/bin/env bash
# Mock-deployment tests for the Azure deployment.
#
# Builds a fake pinned-release bundle, stubs `az`/`kubectl`/`helm`/`docker`, then runs deploy.sh's
# REAL phase functions against them. Nothing touches Azure: every claim is asserted against the
# recorded command line, the rendered manifest, or a real local parser.
#
#   bash azure/test/deploy.test.sh
#
# Optional deps degrade to SKIP: node+nconf (config resolution), helm+git (full chart render).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AZURE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export TMPDIR="$WORK/tmp"
mkdir -p "$TMPDIR"
export DOCKER_CONFIG="$WORK/docker-config"
mkdir -p "$DOCKER_CONFIG"
unset DOCKERHUB_USERNAME DOCKERHUB_TOKEN

PASS=0; FAIL=0; SKIP=0
ok()    { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
no()    { printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '         %s\n' "$2"; FAIL=$((FAIL+1)); return 0; }
skip()  { printf '  \033[33mSKIP\033[0m %s (%s)\n' "$1" "$2"; SKIP=$((SKIP+1)); }
group() { printf '\n\033[1m%s\033[0m\n' "$1"; }
assert_has() { if grep -qF -- "$3" "$2"; then ok "$1"; else no "$1" "expected to find: $3"; fi; }
assert_eq()  { if [[ "$2" == "$3" ]]; then ok "$1"; else no "$1" "expected '$3', got '$2'"; fi; }
# Absorb "PASS x"/"FAIL x" lines emitted by embedded python helpers.
absorb() { while IFS= read -r l; do case "$l" in PASS\ *) ok "${l#PASS }";; FAIL\ *) no "${l#FAIL }";; *) [ -n "$l" ] && printf '         %s\n' "$l";; esac; done; }

# ---------------------------------------------------------------------------
# Stub CLIs. Every call lands in $CALLS; --query lookups return canned values.
# MOCK_NS_EXISTS / MOCK_TIER / MOCK_REDIS_EXISTS let tests steer the scenario.
# ---------------------------------------------------------------------------
BIN="$WORK/bin"; mkdir -p "$BIN"
export CALLS="$WORK/calls.log"; : > "$CALLS"
export MOCK_NS_EXISTS=0 MOCK_TIER=Standard MOCK_REDIS_EXISTS=0 MOCK_REDIS_HA=Enabled
export MOCK_ACR_EXISTS=0 MOCK_ACR_ADMIN_ENABLED=false MOCK_BUSYBOX_DIGEST_EXISTS=0
export MOCK_DNS_LINK_TO_VNET=0

cat > "$BIN/az" <<'STUB'
#!/usr/bin/env bash
echo "az $*" >> "$CALLS"
target_exists() {
  [[ "${MOCK_REDIS_EXISTS:-0}" == 1 ]] ||
    [[ -n "${MOCK_RESOURCE_STATE_DIR:-}" && -f "$MOCK_RESOURCE_STATE_DIR/target" ]]
}
target_json() {
  local cutover="${MOCK_CUTOVER_STARTED:-0}"
  if [[ -n "${MOCK_RESOURCE_STATE_DIR:-}" && -f "$MOCK_RESOURCE_STATE_DIR/cutover" ]]; then cutover=1; fi
  jq -n --arg location "${MOCK_TARGET_LOCATION:-centralus}" --arg sku "${MOCK_TARGET_SKU:-Balanced_B5}" \
    --arg ha "${MOCK_REDIS_HA:-Enabled}" --arg public "${MOCK_TARGET_PUBLIC:-Disabled}" --arg cutover "$cutover" \
    '{name:"mock-redis",location:$location,sku:{name:$sku},highAvailability:$ha,publicNetworkAccess:$public,
      tags:(if $cutover == "1" then {selfhostRedisMigrationCutover:"mock-release"} else {} end)}'
}
case "$*" in
  *"acr repository show"*"busybox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"*)
    [ "${MOCK_BUSYBOX_DIGEST_EXISTS:-0}" = 1 ] && exit 0 || exit 1 ;;
  *"acr repository show"*"example/service"*) exit 1 ;;
  "acr import "*)
    jq -n --args '$ARGS.positional' -- "$@" > "$CALLS.import-args.json"
    if [[ "${MOCK_IMPORT_FAILURE:-0}" = 1 ]]; then
      echo "Mock registry rejected source credentials" >&2
      exit 1
    fi
    exit 0 ;;
  *"acr repository show"*"routerlicious:mock-tag"*|*"acr repository show"*"historian:mock-tag"*|*"acr repository show"*"gitrest:mock-tag"*)
    exit 0 ;;
  *"acr show"*"--query provisioningState"*) echo "Succeeded"; exit 0 ;;
  *"acr show"*"--query adminUserEnabled"*)
    if grep -q "acr update .*--admin-enabled false" "$CALLS"; then echo "false"; else echo "${MOCK_ACR_ADMIN_ENABLED:-false}"; fi
    exit 0 ;;
  *"acr show"*"--query resourceGroup"*)
    [ "${MOCK_ACR_EXISTS:-0}" = 1 ] && echo "mock-rg" && exit 0 || exit 1 ;;
  *"acr show"*"--query loginServer"*) echo "mockbuildacr.azurecr.io"; exit 0 ;;
  *"acr show"*"--query id"*) echo "/subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.ContainerRegistry/registries/mockacr"; exit 0 ;;
  *"acr show"*) [ "${MOCK_ACR_EXISTS:-0}" = 1 ] && exit 0 || exit 1 ;;
  *"extension show"*"redisenterprise"*)                                  exit 0 ;;
  *"redisenterprise create --help"*)
    printf '%s\n' "--access-keys-authentication"
    for ((i = 0; i < 10000; i++)); do printf '%s\n' "additional help output"; done
    exit 0 ;;
  "redisenterprise create "*)
    if [[ -n "${MOCK_RESOURCE_STATE_DIR:-}" ]]; then touch "$MOCK_RESOURCE_STATE_DIR/target"; fi
    exit 0 ;;
  "redisenterprise database list "*)
    if [[ "${MOCK_DATABASE_STATE:-}" == stuck ]]; then echo Updating
    elif [[ "${MOCK_DATABASE_STATE:-}" == Updating && "$(grep -c 'redisenterprise database list' "$CALLS")" == 1 ]]; then echo Updating
    elif [[ "${MOCK_DATABASE_MISSING:-0}" != 1 ]] || grep -q 'redisenterprise database create' "$CALLS"; then echo Succeeded; fi
    exit "${MOCK_DATABASE_LIST_FAILURE:-0}" ;;
  *"redisenterprise database show"*"--query provisioningState"*)          echo "Succeeded"; exit 0 ;;
  *"redisenterprise database show"*"--query accessKeysAuthentication"*)  echo "Enabled"; exit 0 ;;
  *"redisenterprise database show"*"--query clientProtocol"*)            echo "Encrypted"; exit 0 ;;
  *"redisenterprise database show"*"--query clusteringPolicy"*)          echo "NoCluster"; exit 0 ;;
  *"redisenterprise database show"*"--query port"*)                      echo "10000"; exit 0 ;;
  *"redisenterprise database show"*"--query evictionPolicy"*)            echo "${MOCK_DATABASE_EVICTION:-VolatileLRU}"; exit 0 ;;
  *"redisenterprise database list-keys"*)                                echo "mock-redis-key"; exit 0 ;;
  "redisenterprise list "*)
    if target_exists; then target_json | jq -s '.'; else echo '[]'; fi
    exit 0 ;;
  *"redisenterprise show"*"--query provisioningState"*)
    if target_exists || grep -q "redisenterprise create -n" "$CALLS"; then
      if grep -q "redisenterprise wait" "$CALLS"; then echo Succeeded; else echo "${MOCK_REDIS_STATE:-Succeeded}"; fi
      exit 0
    else exit 1; fi ;;
  *"redisenterprise show"*"--query hostName"*)            echo "mock-redis.centralus.redis.azure.net"; exit 0 ;;
  *"redisenterprise show"*"--query highAvailability"*)    echo "${MOCK_REDIS_HA:-Enabled}"; exit 0 ;;
  *"redisenterprise show"*"--query publicNetworkAccess"*) echo "Disabled"; exit 0 ;;
  *"redisenterprise show"*"--query id"*)                  echo "/subscriptions/s/resourceGroups/rg/providers/Microsoft.Cache/redisEnterprise/mock-redis"; exit 0 ;;
  *"redisenterprise show"*)                               [ "${MOCK_REDIS_EXISTS:-0}" = 1 ] && exit 0 || exit 1 ;;
  "redis list "*)
    if [[ "${MOCK_CACHE_EXISTS:-0}" == 1 ]]; then echo '[{"name":"mock-cache"}]'; else echo '[]'; fi
    exit 0 ;;
  "redis show "*"--query provisioningState"*) echo "Succeeded"; exit 0 ;;
  "redis show "*"--query hostName"*) echo "mock-cache.redis.cache.windows.net"; exit 0 ;;
  "redis show "*)
    jq -n --arg public "${MOCK_CACHE_PUBLIC:-Disabled}" --arg auth "${MOCK_CACHE_NO_AUTH:-no}" \
      --arg policy_name "${MOCK_CACHE_POLICY_NAME:-maxmemoryPolicy}" \
      --arg policy "${MOCK_CACHE_POLICY:-volatile-lru}" \
      '{id:"/subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.Cache/Redis/mock-cache",
        provisioningState:"Succeeded",sku:{name:"Premium",capacity:1},minimumTlsVersion:"1.2",
        enableNonSslPort:false,publicNetworkAccess:$public,sslPort:6380,
        redisConfiguration:{($policy_name):$policy,authnotrequired:$auth}}'
    exit 0 ;;
  "redis list-keys "*) echo "mock-cache-key"; exit 0 ;;
  *"eventhubs namespace show"*"--query zoneRedundant"*)       echo "true"; exit 0 ;;
  *"eventhubs namespace show"*"--query sku.tier"*)            echo "${MOCK_TIER:-Standard}"; exit 0 ;;
  *"eventhubs namespace show"*"--query kafkaEnabled"*)        echo "true"; exit 0 ;;
  *"eventhubs namespace show"*"--query publicNetworkAccess"*) echo "Enabled"; exit 0 ;;
  *"eventhubs namespace show"*"--query id"*)                  echo "/subscriptions/s/resourceGroups/rg/providers/Microsoft.EventHub/namespaces/ns"; exit 0 ;;
  *"eventhubs namespace show"*)                               [ "${MOCK_NS_EXISTS:-0}" = 1 ] && exit 0 || exit 1 ;;
  *"eventhubs eventhub show"*"--query partitionCount"*)       echo "32"; exit 0 ;;
  *"eventhubs eventhub show"*)                                exit 1 ;;
  *"authorization-rule keys list"*)                           echo 'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc+/='; exit 0 ;;
  *"keyvault secret set"*)                                    exit "${MOCK_SECRET_EXIT:-0}" ;;
  *"keyvault secret show"*)                                   echo "https://kv.vault.azure.net/secrets/eventhub-connection-string/1"; exit 0 ;;
  "group exists "*) echo true; exit 0 ;;
  "rest --method post "*"/validate?"*)
    if [[ "${MOCK_PREFLIGHT_FAILURE:-0}" == 1 ]]; then echo "insufficient Redis capacity" >&2; exit 1; fi
    echo '{"properties":{"provisioningState":"Succeeded"}}'; exit 0 ;;
  "identity show "*"--query clientId"*) echo "${MOCK_IDENTITY_CLIENT_ID-mock-client}"; exit "${MOCK_IDENTITY_EXIT:-0}" ;;
  "identity show "*"--query principalId"*) echo "${MOCK_IDENTITY_PRINCIPAL_ID-mock-principal}"; exit "${MOCK_IDENTITY_EXIT:-0}" ;;
  "aks show "*"--query addonProfiles.azureKeyvaultSecretsProvider.enabled"*) echo true; exit 0 ;;
  "aks show "*"--query addonProfiles.azureKeyvaultSecretsProvider.identity.clientId"*) echo mock-csi-client; exit 0 ;;
  "keyvault show "*"--query id"*) echo /subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.KeyVault/vaults/mock-kv; exit 0 ;;
  "keyvault show "*"--query properties.provisioningState"*) echo Succeeded; exit 0 ;;
  "keyvault show "*"--query properties.publicNetworkAccess"*)
    if [[ "$(grep 'az keyvault update .*--public-network-access' "$CALLS" | tail -1)" == *"--public-network-access Enabled" ]]; then echo Enabled
    else echo Disabled; fi
    exit 0 ;;
  "role definition list "*) echo mock-role-definition; exit 0 ;;
  "rest --method get "*"/Microsoft.Authorization/roleAssignments"*) echo /mock/existing-role-assignment; exit 0 ;;
  "account get-access-token "*)
    printf 'header.'
    printf '{"oid":"mock-operator"}' | base64 | tr -d '=\n'
    printf '.signature\n'
    exit 0 ;;
  "account show --query tenantId"*) echo mock-tenant; exit 0 ;;
  "network vnet subnet show "*"--query id"*) echo /subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.Network/virtualNetworks/mock-vnet/subnets/pe-subnet; exit 0 ;;
  "network private-endpoint list "*)
    state="${MOCK_PE_STATE:-}"
    if [[ -n "${MOCK_RESOURCE_STATE_DIR:-}" && -f "$MOCK_RESOURCE_STATE_DIR/endpoint-state" ]]; then state="$(cat "$MOCK_RESOURCE_STATE_DIR/endpoint-state")"; fi
    if [[ -z "$state" ]]; then echo '[]'; else
      jq -n --arg state "$state" --arg mismatch "${MOCK_PE_MISMATCH:-}" '[
        {name:"pe-mock-redis",provisioningState:$state,
          subnet:{id:"/subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.Network/virtualNetworks/mock-vnet/subnets/pe-subnet"},
          privateLinkServiceConnections:[{
            privateLinkServiceId:"/subscriptions/s/resourceGroups/rg/providers/Microsoft.Cache/redisEnterprise/mock-redis",
            groupIds:["redisEnterprise"]}]}
        | if $mismatch == "subnet" then .subnet.id = "/other/subnet"
          elif $mismatch == "resource" then .privateLinkServiceConnections[0].privateLinkServiceId = "/other/resource"
          elif $mismatch == "group" then .privateLinkServiceConnections[0].groupIds = ["other"] else . end]'
    fi
    exit 0 ;;
  "network private-endpoint create "*)
    if [[ -n "${MOCK_RESOURCE_STATE_DIR:-}" ]]; then
      if [[ "${MOCK_PE_CREATE_FAILURE:-0}" == 1 ]]; then echo Failed; else echo Succeeded; fi > "$MOCK_RESOURCE_STATE_DIR/endpoint-state"
    fi
    exit "${MOCK_PE_CREATE_FAILURE:-0}" ;;
  "network private-endpoint wait "*) exit "${MOCK_PE_WAIT_FAILURE:-0}" ;;
  "network private-endpoint dns-zone-group create "*) exit "${MOCK_DNS_GROUP_FAILURE:-0}" ;;
  "tag update "*)
    if [[ "${MOCK_TAG_FAILURE:-0}" != 0 ]]; then exit "$MOCK_TAG_FAILURE"; fi
    if [[ -n "${MOCK_RESOURCE_STATE_DIR:-}" ]]; then touch "$MOCK_RESOURCE_STATE_DIR/cutover"; fi
    exit 0 ;;
  *"privateLinkServiceConnections"*)                          echo "${MOCK_PE_APPROVAL:-Approved}"; exit 0 ;;
  *"network vnet show"*"--query id"*)                         echo "/subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.Network/virtualNetworks/mock-vnet"; exit 0 ;;
  *"private-dns link vnet list"*)
    [ "${MOCK_DNS_LINK_TO_VNET:-0}" = 1 ] && echo "link-legacy-resource"
    exit 0 ;;
  *"private-endpoint show"*|*"private-dns zone show"*|*"private-dns link vnet show"*) exit 1 ;;
esac
exit 0
STUB
# git is stubbed too -- deploy.sh fetches the pinned commit at import. Section 9 reaches the real
# git via $REALPATH when it needs an actual clone.
for c in helm docker git; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "$CALLS"\nexit 0\n' "$c" > "$BIN/$c"
done
cat > "$BIN/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >> "$CALLS"
case "$*" in
  "apply -f -") cat >/dev/null ;;
  *"get nodes --no-headers"*) echo "mock-node Ready";;
  *"get deployments "*) cat "$MOCK_DEPLOYMENTS";;
  *"get deployment "*"jsonpath={.spec.replicas}"*) echo "${MOCK_DEPLOYMENT_REPLICAS:-1}";;
  *"get pods --selector "*)
    if [[ "${MOCK_PODS_REMAIN:-0}" == 1 ]]; then echo '{"items":[{}]}'
    elif [[ "${MOCK_PODS_INVALID:-0}" == 1 ]]; then echo '{}'
    else echo '{"items":[]}'; fi ;;
  *"get pvc gitrest-data "*) echo Bound;;
esac
exit 0
STUB
chmod +x "$BIN"/*
REALPATH="$PATH"
export PATH="$BIN:$PATH"

# ---------------------------------------------------------------------------
# Mock repo layout. deploy.sh derives SELFHOST_ROOT from $BASH_SOURCE and runs preflight-check.sh
# at import, so the extracted function block has to sit in a repo-shaped tree with preflight
# stubbed out -- the real one makes live Azure calls.
# ---------------------------------------------------------------------------
REPO="$WORK/repo"; mkdir -p "$REPO/azure" "$REPO/release"
cp "$AZURE_DIR"/*.yaml "$AZURE_DIR"/*.json "$AZURE_DIR"/*.sh "$REPO/azure/" 2>/dev/null || true
cp "$AZURE_DIR/../release/lib.sh" "$REPO/release/lib.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$REPO/azure/preflight-check.sh"
chmod +x "$REPO/azure/preflight-check.sh"

export RELEASE_ROOT="$REPO/release-artifacts"
REL_ID="mock-release"
REL_DIR="$RELEASE_ROOT/$REL_ID"
mkdir -p "$REL_DIR/deployment/azure"
cp "$AZURE_DIR"/*.yaml "$REL_DIR/deployment/azure/" 2>/dev/null || true
printf '{"sourceRepo":"https://github.com/microsoft/FluidFramework","resolvedCommitSha":"0123456789abcdef0123456789abcdef01234567"}\n' > "$REL_DIR/source.json"
printf '{"builtImages":[{"name":"routerlicious","status":"pinned","tag":"mock-tag"}],"dependencyImages":[{"name":"busybox","tag":"1.38.0-glibc","digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"pinned"}]}\n' > "$REL_DIR/images.json"

PARAMS="$WORK/params.json"
# fluidRepoDir is mandatory since the release-pipeline merge; git is stubbed, so a directory with
# a .git marker and compatible Historian source are enough to get past the checkout logic.
mkdir -p "$WORK/fluid/.git"
mkdir -p "$WORK/fluid/server/historian/packages/historian-base/src/services"
printf '%s\n' 'const tokenLifetimeInSec = Math.floor(tokenLifetimeInMSec / 1000);' \
  > "$WORK/fluid/server/historian/packages/historian-base/src/services/riddlerService.ts"
cat > "$PARAMS" <<JSON
{
  "subscriptionId": "00000000-0000-0000-0000-000000000000",
  "resourceGroup": "mock-rg",
  "location": "centralus",
  "fluidRepoDir": "$WORK/fluid",
  "buildAcr":  { "name": "mockbuildacr" },
  "deployAcr": { "name": "mockacr" },
  "aks": { "name": "mock-aks" },
  "keyVault": { "name": "mock-kv" },
  "cosmos": { "clusterName": "mock-cosmos" },
  "redis": { "clusterName": "mock-redis", "highAvailability": "Enabled" },
  "storage": { "accountName": "mockstorage" },
  "kafka": {
    "eventHubs": {
      "namespaceName": "mock-eventhubs",
      "sku": "Standard",
      "capacity": 1,
      "partitionCount": 32,
      "retentionHours": 72,
      "zoneRedundant": true
    }
  },
  "frontDoor": { "profileName": "mock-afd" }
}
JSON

# Definitions only -- cut from the first phase invocation so importing runs no phase. Lives in the
# mock repo so SELFHOST_ROOT resolves there.
FUNCS="$REPO/azure/deploy-functions.sh"
# Anchor on the "# Main" banner, not on the first phase call -- the phase calls are indented
# inside the deploy-only/full branches, so a `^phase...$` anchor silently stops matching and the
# whole Main block gets sourced and executed.
sed '/^# Main$/,$d' "$AZURE_DIR/deploy.sh" > "$FUNCS"

# deploy.sh sets `set -euo pipefail` and exits on bad preconditions, so each phase runs in its own
# subshell -- a failure there must not take the test runner down with it.
#
# PE_SUBNET_ID/VNET/AKS_LOC are normally set by phase0_network. phase3_eventhubs runs after it in
# the real order, so the mock seeds them rather than pulling all of phase0 in.
PHASE0_VARS='PE_SUBNET_ID=/subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.Network/virtualNetworks/mock-vnet/subnets/pe-subnet; VNET=mock-vnet; AKS_LOC=centralus;'
run_phase() { # run_phase <bash-snippet> [params-file]
  bash -c 'source "$1" "$2" "$3" >/dev/null 2>&1 || exit 97; '"$PHASE0_VARS $1" \
       _ "$FUNCS" "$REL_ID" "${2:-$PARAMS}" 2>&1
}
read_vars() { # read_vars <params-file> <var>...
  local pf="$1"; shift
  local snippet="set +euo pipefail; "
  local v; for v in "$@"; do snippet+="printf '$v=%s\\n' \"\${$v:-}\"; "; done
  bash -c 'source "$1" "$2" "$3" >/dev/null 2>&1; '"$snippet" _ "$FUNCS" "$REL_ID" "$pf" 2>/dev/null
}

group "0. Harness"
assert_eq "phase functions extracted, invocations stripped" "$(grep -c '^phase3_eventhubs()' "$FUNCS")" "1"
imp="$(bash -c 'source "$1" "$2" "$3" && echo IMPORT_OK' _ "$FUNCS" "$REL_ID" "$PARAMS" 2>&1 | tail -4)"
if [[ "$imp" == *IMPORT_OK* ]]; then
  ok "deploy.sh imports against a mock pinned-release bundle"
else
  no "deploy.sh imports against a mock pinned-release bundle" "$imp"; printf '\nCannot continue.\n'; exit 1
fi

# ---------------------------------------------------------------------------
group "1. Parameter parsing"
# ---------------------------------------------------------------------------
while IFS='=' read -r k v; do printf -v "V_$k" '%s' "$v"; done < <(
  read_vars "$PARAMS" EVENTHUBS_NAMESPACE EVENTHUBS_SKU EVENTHUBS_CAPACITY EVENTHUBS_PARTITIONS \
            EVENTHUBS_RETENTION_HOURS EVENTHUBS_ZONE_REDUNDANT KAFKA_ENDPOINT REDIS_SKU \
            REDIS_HIGH_AVAILABILITY REDIS_PORT BUSYBOX_IMAGE)
assert_eq "namespaceName parsed"  "${V_EVENTHUBS_NAMESPACE:-}"       "mock-eventhubs"
assert_eq "sku parsed"            "${V_EVENTHUBS_SKU:-}"             "Standard"
assert_eq "capacity parsed"       "${V_EVENTHUBS_CAPACITY:-}"        "1"
assert_eq "partitionCount parsed" "${V_EVENTHUBS_PARTITIONS:-}"      "32"
assert_eq "retentionHours parsed" "${V_EVENTHUBS_RETENTION_HOURS:-}" "72"
assert_eq "zoneRedundant parsed"  "${V_EVENTHUBS_ZONE_REDUNDANT:-}"  "true"
assert_eq "KAFKA_ENDPOINT is the TLS Kafka head on 9093" \
  "${V_KAFKA_ENDPOINT:-}" "mock-eventhubs.servicebus.windows.net:9093"
assert_eq "Azure Managed Redis defaults to Balanced_B5" "${V_REDIS_SKU:-}" "Balanced_B5"
assert_eq "Azure Managed Redis high availability is parsed" "${V_REDIS_HIGH_AVAILABILITY:-}" "Enabled"
assert_eq "Azure Managed Redis uses port 10000" "${V_REDIS_PORT:-}" "10000"
assert_eq "secret init image uses the release-pinned ACR digest" "${V_BUSYBOX_IMAGE:-}" \
  "mockacr.azurecr.io/busybox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

TILDE="$WORK/params-tilde.json"
jq '.fluidRepoDir = "~/fluid"' "$PARAMS" > "$TILDE"
mkdir -p "$WORK/home/fluid/.git"
mkdir -p "$WORK/home/fluid/server/historian/packages/historian-base/src/services"
printf '%s\n' 'const tokenLifetimeInSec = Math.floor(tokenLifetimeInMSec / 1000);' \
  > "$WORK/home/fluid/server/historian/packages/historian-base/src/services/riddlerService.ts"
tilde_root="$(HOME="$WORK/home" read_vars "$TILDE" FLUID_REPO_DIR | sed -n 's/^FLUID_REPO_DIR=//p')"
assert_eq "fluidRepoDir expands a leading tilde" "$tilde_root" "$WORK/home/fluid"

MIN="$WORK/params-min.json"
jq 'del(.kafka.eventHubs.sku, .kafka.eventHubs.capacity, .kafka.eventHubs.partitionCount,
        .kafka.eventHubs.retentionHours, .kafka.eventHubs.zoneRedundant)' "$PARAMS" > "$MIN"
d="$(read_vars "$MIN" EVENTHUBS_SKU EVENTHUBS_CAPACITY EVENTHUBS_PARTITIONS EVENTHUBS_RETENTION_HOURS EVENTHUBS_ZONE_REDUNDANT EVENTHUBS_AUTO_INFLATE EVENTHUBS_MAX_TU | tr '\n' ' ')"
[[ "$d" == *"EVENTHUBS_SKU=Standard"* && "$d" == *"EVENTHUBS_CAPACITY=4"* && "$d" == *"EVENTHUBS_PARTITIONS=32"* \
   && "$d" == *"EVENTHUBS_RETENTION_HOURS=72"* && "$d" == *"EVENTHUBS_ZONE_REDUNDANT=true"* \
   && "$d" == *"EVENTHUBS_AUTO_INFLATE=true"* && "$d" == *"EVENTHUBS_MAX_TU=10"* ]] \
  && ok "baseline defaults apply when optional keys are omitted" \
  || no "baseline defaults apply when optional keys are omitted" "$d"

# ---------------------------------------------------------------------------
group "2. Mock deploy: phase3_eventhubs on a fresh subscription"
# ---------------------------------------------------------------------------
: > "$CALLS"; export MOCK_NS_EXISTS=0 MOCK_TIER=Standard
out="$(run_phase 'phase3_eventhubs')"; rc=$?
assert_eq "phase3_eventhubs exits 0" "$rc" "0"
[[ $rc -ne 0 ]] && printf '%s\n' "$out" | tail -25 | sed 's/^/         /'
assert_has "namespace: --sku Standard"                  "$CALLS" "--sku Standard"
assert_has "namespace: --capacity 1"                    "$CALLS" "--capacity 1"
assert_has "namespace: --enable-kafka true"             "$CALLS" "--enable-kafka true"
assert_has "namespace: --zone-redundant true"           "$CALLS" "--zone-redundant true"
assert_has "namespace: auto-inflate on (absorbs bursts)"  "$CALLS" "--enable-auto-inflate true"
assert_has "namespace: auto-inflate ceiling"             "$CALLS" "--maximum-throughput-units 10"
assert_has "namespace: TLS floor 1.2"                   "$CALLS" "--minimum-tls-version 1.2"
assert_has "hub rawdeltas created"                      "$CALLS" "-n rawdeltas"
assert_has "hub deltas created"                         "$CALLS" "-n deltas"
assert_has "hubs at 32 partitions"                      "$CALLS" "--partition-count 32"
assert_has "hubs at 72h retention"                      "$CALLS" "--retention-time-in-hours 72"
assert_has "connection string written to Key Vault"     "$CALLS" "eventhub-connection-string"
assert_has "Key Vault receives secret values through a private file" "$CALLS" "--file"
if grep "keyvault secret set" "$CALLS" | grep -q "SharedAccessKey"; then
  no "Event Hubs credentials never enter the Azure CLI argument list"
else
  ok "Event Hubs credentials never enter the Azure CLI argument list"
fi
assert_has "public network access disabled"             "$CALLS" "--public-network-access Disabled"
assert_has "private endpoint created"                   "$CALLS" "private-endpoint create"
assert_has "private DNS zone privatelink.servicebus"    "$CALLS" "privatelink.servicebus.windows.net"
if grep -E '^(kubectl|helm) ' "$CALLS" | grep -q 'SharedAccessKey'; then
  no "SAS key never reaches a kubectl/helm command line"
else ok "SAS key never reaches a kubectl/helm command line"; fi

# ---------------------------------------------------------------------------
group "3. Mock deploy: re-run is idempotent"
# ---------------------------------------------------------------------------
: > "$CALLS"; export MOCK_NS_EXISTS=1
out="$(run_phase 'phase3_eventhubs')"; rc=$?
assert_eq "re-run exits 0" "$rc" "0"
if grep -q "namespace create" "$CALLS"; then no "re-run does not recreate the namespace"
else ok "re-run does not recreate the namespace"; fi
printf '%s' "$out" | grep -q "already exists, skipping create" \
  && ok "re-run reports the skip" || no "re-run reports the skip"
export MOCK_NS_EXISTS=0

: > "$CALLS"; export MOCK_DNS_LINK_TO_VNET=1
out="$(run_phase 'create_private_endpoint /subscriptions/s/resourceGroups/mock-rg/providers/Microsoft.Storage/storageAccounts/new-storage file new-storage privatelink.file.core.windows.net')"; rc=$?
assert_eq "renamed resource reuses the VNet's existing private DNS link" "$rc" "0"
if grep -q "private-dns link vnet create" "$CALLS"; then
  no "existing VNet link is not recreated under the new resource name"
else
  ok "existing VNet link is not recreated under the new resource name"
fi
printf '%s' "$out" | grep -q "reusing it" \
  && ok "existing private DNS link reuse is reported" || no "existing private DNS link reuse is reported"
export MOCK_DNS_LINK_TO_VNET=0

# ---------------------------------------------------------------------------
group "4. Mock deploy: Azure Managed Redis"
# ---------------------------------------------------------------------------
: > "$CALLS"; export MOCK_REDIS_EXISTS=0
out="$(run_phase 'phase8_redis')"; rc=$?
assert_eq "phase8_redis exits 0" "$rc" "0"
[[ $rc -ne 0 ]] && printf '%s\n' "$out" | tail -25 | sed 's/^/         /'
assert_has "Managed Redis uses Balanced_B5"             "$CALLS" "--sku Balanced_B5"
assert_has "Managed Redis keeps high availability"      "$CALLS" "--high-availability Enabled"
assert_has "Managed Redis disables public access"       "$CALLS" "--public-network-access Disabled"
assert_has "database enables compatible access keys"    "$CALLS" "--access-keys-authentication Enabled"
assert_has "database requires encrypted clients"        "$CALLS" "--client-protocol Encrypted"
assert_has "database remains non-clustered for Fluid"    "$CALLS" "--clustering-policy NoCluster"
assert_has "database preserves volatile-only eviction"   "$CALLS" "--eviction-policy VolatileLRU"
assert_has "database uses the managed TLS port"          "$CALLS" "--port 10000"
assert_has "access key is written to Key Vault"          "$CALLS" "redis-password"
assert_has "private endpoint uses redisEnterprise group" "$CALLS" "--group-id redisEnterprise"
assert_has "private DNS zone is Managed Redis"           "$CALLS" "privatelink.redis.azure.net"
if grep -qE '(^| )az redis (create|show|list-keys)' "$CALLS"; then
  no "classic Azure Cache for Redis CLI is not used"
else ok "classic Azure Cache for Redis CLI is not used"; fi

: > "$CALLS"; export MOCK_REDIS_EXISTS=1
out="$(run_phase 'phase8_redis')"; rc=$?
assert_eq "Managed Redis re-run exits 0" "$rc" "0"
if grep -q "redisenterprise create -n" "$CALLS"; then no "Managed Redis re-run does not recreate the cache"
else ok "Managed Redis re-run does not recreate the cache"; fi
export MOCK_REDIS_EXISTS=0

DISABLED_HA="$WORK/params-disabled-ha.json"
jq '.redis.highAvailability = "Disabled"' "$PARAMS" > "$DISABLED_HA"
: > "$CALLS"; export MOCK_REDIS_EXISTS=0 MOCK_REDIS_HA=Disabled
out="$(run_phase 'phase8_redis' "$DISABLED_HA")"; rc=$?
assert_eq "Managed Redis supports explicitly disabled HA" "$rc" "0"
assert_has "Managed Redis passes disabled HA to Azure" "$CALLS" "--high-availability Disabled"
export MOCK_REDIS_HA=Enabled

CACHE_PARAMS="$WORK/params-cache.json"
jq '.redis = {useDeprecated:true,clusterName:"mock-cache",sku:"Premium",capacity:1}' "$PARAMS" > "$CACHE_PARAMS"
: > "$CALLS"
out="$(run_phase 'phase8_redis' "$CACHE_PARAMS")"; rc=$?
assert_eq "Azure Cache fallback provisioning exits 0" "$rc" "0"
assert_has "Azure Cache uses ARM creation with private access from the start" "$CALLS" "deployment group create"
assert_has "Azure Cache uses the redisCache private endpoint group" "$CALLS" "--group-id redisCache"
assert_has "Azure Cache uses its own private DNS zone" "$CALLS" "privatelink.redis.cache.windows.net"
assert_has "Azure Cache retrieves its own access key" "$CALLS" "redis list-keys"
assert_eq "Azure Cache uses TLS port 6380" "$(read_vars "$CACHE_PARAMS" REDIS_PORT | sed 's/REDIS_PORT=//')" "6380"
if grep -q "redisenterprise" "$CALLS"; then no "Azure Cache does not require the AMR extension"
else ok "Azure Cache does not require the AMR extension"; fi
assert_has "Azure Cache warns about retirement" <(printf '%s' "$out") "September 30, 2028"

: > "$CALLS"; export MOCK_CACHE_EXISTS=1
out="$(run_phase 'phase8_redis' "$CACHE_PARAMS")"; rc=$?
assert_eq "Azure Cache re-run exits 0" "$rc" "0"
if grep -q "deployment group create" "$CALLS"; then no "Azure Cache re-run does not recreate the cache"
else ok "Azure Cache re-run does not recreate the cache"; fi
export MOCK_CACHE_EXISTS=0

: > "$CALLS"; export MOCK_CACHE_POLICY_NAME=maxmemory-policy
out="$(run_phase 'phase8_redis' "$CACHE_PARAMS")"; rc=$?
assert_eq "Azure Cache accepts ARM eviction-policy property spelling" "$rc" "0"
unset MOCK_CACHE_POLICY_NAME

for incompatible in public no-auth eviction; do
  : > "$CALLS"
  if [[ "$incompatible" == public ]]; then export MOCK_CACHE_PUBLIC=Enabled
  elif [[ "$incompatible" == no-auth ]]; then export MOCK_CACHE_NO_AUTH=yes
  else export MOCK_CACHE_POLICY=allkeys-lru; fi
  out="$(run_phase 'phase8_redis' "$CACHE_PARAMS")"; rc=$?
  [[ "$rc" != 0 ]] && ok "incompatible $incompatible cache is rejected" || no "incompatible $incompatible cache is rejected"
  if grep -q 'keyvault secret set' "$CALLS"; then no "incompatible cache does not publish credentials"
  else ok "incompatible cache does not publish credentials"; fi
  export MOCK_CACHE_PUBLIC=Disabled MOCK_CACHE_NO_AUTH=no MOCK_CACHE_POLICY=volatile-lru
done

: > "$CALLS"
out="$(run_phase 'initialize_deploy_only_mode' "$CACHE_PARAMS")"; rc=$?
assert_eq "deploy-only resolves Azure Cache without AMR calls" "$rc" "0"
assert_has "deploy-only uses the Azure Cache hostname" <(printf '%s' "$out") "mock-cache.redis.cache.windows.net"

for legacy in false true; do
  if [[ "$legacy" == true ]]; then
    sed 's/<REDIS_PORT>/10000/g' "$AZURE_DIR/backends.yaml" > "$REL_DIR/deployment/azure/backends.yaml"
  fi
  : > "$CALLS"
  out="$(run_phase 'resolve_redis_hostname; phase4_backends; cat "$DEPLOY_DIR/backends.yaml"' "$CACHE_PARAMS")"; rc=$?
  assert_eq "backend rendering succeeds (legacy=$legacy)" "$rc" "0"
  assert_eq "all three backend Redis ports use 6380 (legacy=$legacy)" \
    "$(grep -c '__port, value: "6380"' <<<"$out")" "3"
  assert_eq "both backends and throttling use the cache hostname (legacy=$legacy)" \
    "$(grep -c '__host, value: "mock-cache.redis.cache.windows.net"' <<<"$out")" "3"
done
cp "$AZURE_DIR/backends.yaml" "$REL_DIR/deployment/azure/backends.yaml"

# ---------------------------------------------------------------------------
group "5. Guard rails"
# ---------------------------------------------------------------------------
: > "$CALLS"; export MOCK_ACR_EXISTS=0 MOCK_ACR_ADMIN_ENABLED=false
out="$(run_phase 'phase0_rg_acr')"; rc=$?
assert_eq "fresh deploy ACR provisioning exits 0" "$rc" "0"
assert_has "fresh deploy ACR disables the admin account at creation" "$CALLS" "--admin-enabled false"

: > "$CALLS"; export MOCK_ACR_EXISTS=1 MOCK_ACR_ADMIN_ENABLED=true
out="$(run_phase 'phase0_rg_acr')"; rc=$?
assert_eq "existing deploy ACR reconciliation exits 0" "$rc" "0"
assert_has "existing deploy ACR has its admin account disabled" "$CALLS" "acr update -g mock-rg -n mockacr --admin-enabled false"

: > "$CALLS"; export MOCK_ACR_EXISTS=1 MOCK_ACR_ADMIN_ENABLED=true
build_registry="$(
  PARAMETERS_FILE="$PARAMS" "$AZURE_DIR/../release/setup-build-registry.sh" mockbuildacr 2>/dev/null
)"; rc=$?
assert_eq "existing build ACR reconciliation exits 0" "$rc" "0"
assert_eq "build ACR setup still returns its login server" "$build_registry" "mockbuildacr.azurecr.io"
assert_has "existing build ACR has its admin account disabled" "$CALLS" \
  "acr update -g mock-rg -n mockbuildacr --admin-enabled false"

: > "$CALLS"; export MOCK_BUSYBOX_DIGEST_EXISTS=0
out="$(run_phase 'phase1_images')"; rc=$?
assert_eq "dependency image import exits 0" "$rc" "0"
assert_has "dependency import checks the release-pinned digest" "$CALLS" \
  "busybox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
assert_has "missing pinned busybox digest is imported into the deploy ACR" "$CALLS" \
  "acr import --name mockacr --source docker.io/library/busybox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
assert_eq "anonymous imports omit source authentication flags" \
  "$(jq 'index("--username") == null and index("--password") == null' "$CALLS.import-args.json")" "true"

: > "$CALLS"
out="$(DOCKERHUB_USERNAME=test-user DOCKERHUB_TOKEN=test-only-token run_phase 'phase1_images')"; rc=$?
assert_eq "authenticated Docker Hub import exits 0" "$rc" "0"
assert_has "authenticated import uses az acr import" "$CALLS" "acr import --name mockacr"
assert_eq "source credentials are passed through Azure CLI flags" \
  "$(jq -r '.[index("--username") + 1] + ":" + .[index("--password") + 1]' "$CALLS.import-args.json")" \
  "test-user:test-only-token"
assert_eq "authenticated import preserves the pinned digest" \
  "$(jq -r '.[index("--source") + 1]' "$CALLS.import-args.json")" \
  "docker.io/library/busybox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
if [[ "$out" == *test-only-token* ]]; then
  no "source token stays out of deployment output"
else
  ok "source token stays out of deployment output"
fi

if grep -q 'rest --method post\|acr show .*--query id' "$CALLS"; then
  no "imports do not use a custom ARM request"
else
  ok "imports do not use a custom ARM request"
fi
assert_eq "Azure CLI handles completion without custom digest polling" \
  "$(grep -c 'acr repository show.*busybox@sha256:' "$CALLS")" "1"
assert_eq "authenticated image is imported exactly once" "$(grep -c '^az acr import ' "$CALLS")" "1"

for missing in username token; do
  : > "$CALLS"
  if [[ "$missing" == username ]]; then
    out="$(DOCKERHUB_USERNAME= DOCKERHUB_TOKEN=test-only-token run_phase 'phase1_images')"; rc=$?
  else
    out="$(DOCKERHUB_USERNAME=test-user DOCKERHUB_TOKEN= run_phase 'phase1_images')"; rc=$?
  fi
  [[ "$rc" != 0 ]] && ok "missing Docker Hub $missing is rejected" || no "missing Docker Hub $missing is rejected"
  assert_has "partial credentials explain which variables are needed" <(printf '%s' "$out") \
    "set both DOCKERHUB_USERNAME and DOCKERHUB_TOKEN"
  if grep -q '^az acr ' "$CALLS"; then
    no "partial credentials fail before registry login or import"
  else
    ok "partial credentials fail before registry login or import"
  fi
done

printf '%s\n' '{"credsStore":"must-not-be-read","auths":{"https://index.docker.io/v1/":{"auth":"dXNlcjp0b2tlbg=="}}}' \
  > "$DOCKER_CONFIG/config.json"
: > "$CALLS"
out="$(run_phase 'phase1_images')"; rc=$?
assert_eq "saved Docker configuration is not needed for imports" "$rc" "0"
assert_eq "saved Docker credentials are ignored without environment credentials" \
  "$(jq 'index("--username") == null and index("--password") == null' "$CALLS.import-args.json")" "true"
rm "$DOCKER_CONFIG/config.json"

: > "$CALLS"
out="$(MOCK_IMPORT_FAILURE=1 DOCKERHUB_USERNAME=test-user DOCKERHUB_TOKEN=test-only-token \
  run_phase 'phase1_images')"; rc=$?
[[ "$rc" != 0 ]] && ok "authenticated import failures stop deployment" \
  || no "authenticated import failures stop deployment"
assert_eq "rejected source credentials never silently retry anonymously" \
  "$(grep -c '^az acr import ' "$CALLS")" "1"
assert_has "rejected import used the environment credentials" "$CALLS" "--username test-user --password test-only-token"
[[ "$out" == *"Mock registry rejected source credentials"* ]] \
  && ok "authenticated import failure remains visible" \
  || no "authenticated import failure remains visible"

: > "$CALLS"
out="$(DOCKERHUB_USERNAME=test-user DOCKERHUB_TOKEN='test token * --flag' run_phase 'phase1_images')"; rc=$?
assert_eq "source credentials with shell metacharacters import successfully" "$rc" "0"
assert_eq "the source token remains one literal command argument" \
  "$(jq -r '.[index("--password") + 1]' "$CALLS.import-args.json")" "test token * --flag"

CUSTOM_IMAGES="$WORK/custom-import-images.json"
for kind in built dependency; do
  for registry in docker.io registry.hub.docker.com index.docker.io example.azurecr.io; do
    jq --arg repository "$registry/example/service" --arg kind "$kind" '
      if $kind == "built" then
        .builtImages[0].repository = $repository |
        .builtImages[0].digest = .dependencyImages[0].digest |
        .dependencyImages = []
      else .dependencyImages[0].name = $repository end
    ' "$REL_DIR/images.json" > "$CUSTOM_IMAGES"
    : > "$CALLS"
    out="$(TEST_IMAGES_FILE="$CUSTOM_IMAGES" DOCKERHUB_USERNAME=test-user DOCKERHUB_TOKEN=test-only-token \
      run_phase 'IMAGES_FILE="$TEST_IMAGES_FILE"; phase1_images')"; rc=$?
    assert_eq "$kind image from $registry imports successfully" "$rc" "0"
    if [[ "$registry" == example.azurecr.io ]]; then expected_auth=false; else expected_auth=true; fi
    assert_eq "$kind image only receives Docker Hub credentials for Docker Hub sources" \
      "$(jq 'index("--username") != null and index("--password") != null' "$CALLS.import-args.json")" "$expected_auth"
    assert_has "$kind image preserves its source registry" "$CALLS" "--source $registry/example/service@sha256:"
  done
done

jq '.dependencyImages = [
  (.dependencyImages[0] | .name = "docker.io/example/service"),
  (.dependencyImages[0] | .name = "example.azurecr.io/example/service")
]' "$REL_DIR/images.json" > "$CUSTOM_IMAGES"
: > "$CALLS"
out="$(TEST_IMAGES_FILE="$CUSTOM_IMAGES" DOCKERHUB_USERNAME=test-user DOCKERHUB_TOKEN=test-only-token \
  run_phase 'IMAGES_FILE="$TEST_IMAGES_FILE"; phase1_images')"; rc=$?
assert_eq "mixed-registry dependencies import successfully" "$rc" "0"
assert_eq "Docker Hub credentials are cleared before the next non-Hub import" \
  "$(jq 'index("--username") == null and index("--password") == null' "$CALLS.import-args.json")" "true"

: > "$CALLS"; export MOCK_BUSYBOX_DIGEST_EXISTS=1
out="$(run_phase 'phase1_images')"; rc=$?
assert_eq "existing dependency digest check exits 0" "$rc" "0"
if grep -q "acr import .*busybox" "$CALLS"; then
  no "existing pinned busybox digest is not re-imported"
else
  ok "existing pinned busybox digest is not re-imported"
fi

export MOCK_ACR_EXISTS=0 MOCK_ACR_ADMIN_ENABLED=false MOCK_BUSYBOX_DIGEST_EXISTS=0
assert_has "deploy ACR is created with its admin account disabled" "$AZURE_DIR/deploy.sh" "--admin-enabled false"
if grep -qF -- "--admin-enabled true" "$AZURE_DIR/deploy.sh"; then
  no "deploy.sh never enables the ACR admin account"
else
  ok "deploy.sh never enables the ACR admin account"
fi
assert_has "build ACR is created with its admin account disabled" \
  "$AZURE_DIR/../release/setup-build-registry.sh" "--admin-enabled false"
if grep -qF -- "--admin-enabled true" "$AZURE_DIR/../release/setup-build-registry.sh"; then
  no "setup-build-registry.sh never enables the ACR admin account"
else
  ok "setup-build-registry.sh never enables the ACR admin account"
fi
assert_has "secret init patch receives the pinned image reference" "$AZURE_DIR/deploy.sh" \
  '--arg busyboxImage "$busybox_image"'
assert_has "secret init patch renders the pinned image reference" "$AZURE_DIR/deploy.sh" \
  '"name": "load-secrets", "image": $busyboxImage'
assert_has "dependency imports verify the expected digest, not only a mutable tag" "$AZURE_DIR/deploy.sh" \
  '--image "$target_repo@$digest"'
if grep -qF "source \"\$AFD_HOSTS_FILE\"" "$AZURE_DIR/deploy.sh"; then
  no "Front Door deployment state is never executed as shell"
else
  ok "Front Door deployment state is never executed as shell"
fi
assert_has "deployment artifacts use a private unpredictable directory" "$AZURE_DIR/deploy.sh" \
  'mktemp -d "$TEMP_BASE/selfhost-fluid-${AKS}.XXXXXX"'

export MOCK_NS_EXISTS=1 MOCK_TIER=Basic
out="$(run_phase 'phase3_eventhubs')"; rc=$?
[[ $rc -ne 0 ]] && ok "Basic tier rejected (it has no Kafka endpoint)" \
                || no "Basic tier rejected (it has no Kafka endpoint)" "expected non-zero exit"
printf '%s' "$out" | grep -q "Basic tier" && ok "Basic-tier error names the cause" \
                                          || no "Basic-tier error names the cause"
export MOCK_TIER=Standard MOCK_NS_EXISTS=0

NONS="$WORK/params-nons.json"; jq '.kafka.eventHubs.namespaceName = ""' "$PARAMS" > "$NONS"
out="$(run_phase 'phase3_eventhubs' "$NONS")"; rc=$?
[[ $rc -ne 0 ]] && ok "empty namespaceName rejected before any az call" \
                || no "empty namespaceName rejected before any az call"

# ---------------------------------------------------------------------------
group "6. Rendered manifests"
# ---------------------------------------------------------------------------
SPC="$WORK/spc.yaml"
sed -e "s|<WORKLOAD_IDENTITY_CLIENT_ID>|cid|g" -e "s|<KV>|mock-kv|g" -e "s|<AZURE_TENANT_ID>|tid|g" \
    "$AZURE_DIR/secretproviderclass.yaml" > "$SPC"
grep -q '<[A-Z_]*>' "$SPC" && no "SecretProviderClass fully substituted" || ok "SecretProviderClass fully substituted"
absorb < <(python3 - "$SPC" <<'PY'
import sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
names = [yaml.safe_load(o)['objectName'] for o in yaml.safe_load(d['spec']['parameters']['objects'])['array']]
want = ['cosmos-connection-string', 'redis-password', 'eventhub-connection-string']
print(("PASS " if names == want else "FAIL ") + "CSI mounts all 3 secrets incl. eventhub-connection-string")
if names != want: print("got: %s" % names)
PY
)

VALS="$WORK/values.yaml"
sed -e "s|<ACR>|mockacr|g" -e "s|<IMAGE_TAG>|t1|g" -e "s|<REDIS_HOSTNAME>|r.centralus.redis.azure.net|g" \
    -e "s|<REDIS_PORT>|10000|g" \
    -e "s|<KAFKA_ENDPOINT>|mock-eventhubs.servicebus.windows.net:9093|g" \
    -e "s|<ALFRED_EXTERNAL_URL>|http://a|g" -e "s|<NEXUS_EXTERNAL_URL>|http://n|g" \
    -e "s|<HISTORIAN_EXTERNAL_URL>|http://h|g" "$AZURE_DIR/routerlicious-values.yaml" > "$VALS"
grep -q '<[A-Z_]*>' "$VALS" && no "chart values fully substituted" || ok "chart values fully substituted"
assert_eq "kafka.url points at Event Hubs" \
  "$(python3 -c "import yaml;print(yaml.safe_load(open('$VALS'))['kafka']['url'])")" \
  "mock-eventhubs.servicebus.windows.net:9093"
assert_eq "all Routerlicious Redis clients use Managed Redis port 10000" \
  "$(python3 -c "import yaml;d=yaml.safe_load(open('$VALS'));print(','.join(str(d[k]['port']) for k in ('redis','redis2','redisForThrottling','redisForTenantCache')))")" \
  "10000,10000,10000,10000"

missing=""
for ph in $(grep -o '<[A-Z_]\+>' "$AZURE_DIR/routerlicious-values.yaml" | sort -u); do
  grep -qF "s|$ph|" "$AZURE_DIR/deploy.sh" || missing="$missing $ph"
done
[[ -z "$missing" ]] && ok "every values placeholder has a deploy.sh sed rule" \
                    || no "every values placeholder has a deploy.sh sed rule" "orphaned:$missing"

# ---------------------------------------------------------------------------
group "7. Kafka client tuning vs the reference baseline"
# ---------------------------------------------------------------------------
read_vars "$PARAMS" KAFKA_TUNING_ENV_JSON | sed 's/^KAFKA_TUNING_ENV_JSON=//' > "$WORK/tuning.json"
absorb < <(python3 - "$WORK/tuning.json" <<'PY'
import sys, json
by = {e['name']: e['value'] for e in json.load(open(sys.argv[1]))}
ref_c = {"connections.max.idle.ms":180000,"heartbeat.interval.ms":3000,"max.poll.interval.ms":300000,
         "metadata.max.age.ms":180000,"session.timeout.ms":30000}
ref_p = {"connections.max.idle.ms":180000,"delivery.timeout.ms":120050,"linger.ms":5,
         "message.max.bytes":1000000,"metadata.max.age.ms":180000,"request.timeout.ms":60000,
         "retries":4,"topic.metadata.refresh.interval.ms":60000}
c = json.loads(by["kafka__lib__consumerGlobalAdditionalConfig"])
p = json.loads(by["kafka__lib__producerGlobalAdditionalConfig"])
for name, good in [
  ("consumer block matches the reference baseline (5/5 keys)", c == ref_c),
  ("producer block matches the reference baseline (8/8 keys)", p == ref_p),
  ("consumeLoopTimeoutDelay=0 (reference baseline)", by.get("kafka__lib__rdkafkaConsumeLoopTimeoutDelay") == "0"),
  ("cooperative-sticky excluded (not production-validated)", "partition.assignment.strategy" not in c),
  ("client idle timeout under the Event Hubs ~240s drop", c["connections.max.idle.ms"] < 240000),
  ("maxBatchSize omitted (no-op on the rdkafka path)", "kafka__lib__maxBatchSize" not in by),
]:
    print(("PASS " if good else "FAIL ") + name)
PY
)

# ---------------------------------------------------------------------------
group "8. Init container secret wiring"
# ---------------------------------------------------------------------------
MNT="$WORK/mnt/secrets"; CFG="$WORK/config"; mkdir -p "$MNT" "$CFG"
# No user:pass in this mock -- the '&' is what the test exercises, and a credential-shaped
# URI trips secret scanning on push.
printf 'mongodb://c.mongo.cosmos.azure.com/?ssl=true&retrywrites=false' > "$MNT/cosmos-connection-string"
printf 'redispass' > "$MNT/redis-password"
printf 'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc+/=' > "$MNT/eventhub-connection-string"
INIT="$(grep -o "init_script='[^']*'" "$AZURE_DIR/deploy.sh" | head -1 | sed "s/^init_script='//; s/'\$//")"
INIT="${INIT//\/mnt\/secrets/$MNT}"; INIT="${INIT//\/config/$CFG}"
sh -c "$INIT"; init_rc=$?
assert_eq "init script exits 0 (non-zero = CrashLoopBackOff)" "$init_rc" "0"
assert_has "exports kafka__lib__eventHubConnString" "$CFG/secrets.env" "kafka__lib__eventHubConnString"
sourced="$(sh -c ". $CFG/secrets.env; printf '%s|%s' \"\$kafka__lib__eventHubConnString\" \"\$mongo__operationsDbEndpoint\"")"
[[ "$sourced" == *"SharedAccessKey=abc+/="* ]] && ok "SAS key survives sourcing (+ / = intact)" \
                                               || no "SAS key survives sourcing" "$sourced"
[[ "$sourced" == *"retrywrites=false"* ]] && ok "Mongo string not truncated at '&'" \
                                          || no "Mongo string not truncated at '&'" "$sourced"

# ---------------------------------------------------------------------------
group "9. Config resolution through real nconf"
# ---------------------------------------------------------------------------
if PATH="$REALPATH" command -v node >/dev/null 2>&1; then
  ( cd "$WORK" && PATH="$REALPATH" npm install nconf --silent --no-fund --no-audit >/dev/null 2>&1 )
  if [[ -d "$WORK/node_modules/nconf" ]]; then
    printf '{"kafka":{"lib":{"name":"rdkafka","endpoint":"x","eventHubConnString":""}}}\n' > "$WORK/cfg.json"
    cat > "$WORK/t.js" <<'JS'
const nconf = require("nconf");
const c = nconf.argv().env({ separator: "__", parseValues: true }).file(process.env.CFG).use("memory");
const v = c.get("kafka:lib:eventHubConnString");
const con = c.get("kafka:lib:consumerGlobalAdditionalConfig");
console.log(JSON.stringify({ sasl: !!v, key: v || "", type: typeof con, idle: con && con["connections.max.idle.ms"] }));
JS
    base="$(cd "$WORK" && PATH="$REALPATH" CFG="$WORK/cfg.json" node t.js)"
    [[ "$(jq -r .sasl <<<"$base")" == "false" ]] \
      && ok "empty eventHubConnString => client stays on plaintext" \
      || no "empty eventHubConnString => client stays on plaintext" "$base"
    live="$(cd "$WORK" && PATH="$REALPATH" CFG="$WORK/cfg.json" \
      kafka__lib__eventHubConnString='Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKey=abc+/=' \
      kafka__lib__consumerGlobalAdditionalConfig='{"connections.max.idle.ms":180000}' node t.js)"
    [[ "$(jq -r .sasl <<<"$live")" == "true" ]] && ok "env var flips rdkafka onto SASL_SSL/PLAIN" \
                                                || no "env var flips rdkafka onto SASL_SSL/PLAIN" "$live"
    [[ "$(jq -r .key <<<"$live")" == *"SharedAccessKey=abc+/="* ]] \
      && ok "connection string reaches nconf byte-identical" \
      || no "connection string reaches nconf byte-identical" "$live"
    [[ "$(jq -r .type <<<"$live")" == "object" && "$(jq -r .idle <<<"$live")" == "180000" ]] \
      && ok "nested tuning JSON parses to an object with numeric values" \
      || no "nested tuning JSON parses to an object with numeric values" "$live"
  else
    skip "config resolution through real nconf" "npm install nconf unavailable"
  fi
else
  skip "config resolution through real nconf" "node not installed"
fi

# ---------------------------------------------------------------------------
group "10. Chart template patch + helm render"
# ---------------------------------------------------------------------------
if PATH="$REALPATH" command -v helm >/dev/null 2>&1 && PATH="$REALPATH" command -v git >/dev/null 2>&1; then
  if PATH="$REALPATH" git clone -q --branch main --depth 1 \
       https://github.com/microsoft/FluidFramework.git "$WORK/ff" 2>/dev/null; then
    CH="$WORK/ff/server/routerlicious/kubernetes/routerlicious"
    T="$CH/templates/fluid-configmap.yaml"
    awk '/"kafkaCheckpointOnReprocessingOp": \{\{ \.Values\.checkpoints\.kafkaCheckpointOnReprocessingOp \}\}$/ {
           print $0 ","; print "            \"ignoreCheckpointFlushException\": {{ .Values.checkpoints.ignoreCheckpointFlushException }}"; next } { print }' "$T" > "$T.t" && mv "$T.t" "$T"
    awk '/"rdkafkaMaxConsumerCommitRetries": 10$/ {
           print $0 ","; print "                \"eventHubConnString\": \"\""; next } { print }' "$T" > "$T.t" && mv "$T.t" "$T"
    grep -qF 'eventHubConnString' "$T" && ok "chart patch applies to a fresh upstream clone" \
                                       || no "chart patch applies to a fresh upstream clone" "upstream anchor may have changed"
    mkdir -p "$WORK/fluid/server/routerlicious/kubernetes"
    cp -R "$CH" "$WORK/fluid/server/routerlicious/kubernetes/"
    for legacy in false true; do
      if [[ "$legacy" == true ]]; then
        sed 's/<REDIS_PORT>/10000/g' "$AZURE_DIR/routerlicious-values.yaml" > "$REL_DIR/deployment/azure/routerlicious-values.yaml"
      fi
      : > "$CALLS"
      out="$(MOCK_DEPLOYMENT_REPLICAS=0 run_phase 'resolve_redis_hostname; phase5_helm; cat "$DEPLOY_DIR/routerlicious-values.yaml"' "$CACHE_PARAMS")"; rc=$?
      assert_eq "real Helm phase renders cache values (legacy=$legacy)" "$rc" "0"
      assert_eq "all four logical caches use 6380 (legacy=$legacy)" "$(grep -c '^  port: 6380$' <<<"$out")" "4"
      assert_eq "all four logical caches use the fallback hostname (legacy=$legacy)" \
        "$(grep -c '^  url: mock-cache.redis.cache.windows.net$' <<<"$out")" "4"
      for service in alfred nexus riddler deli scribe scriptorium; do
        assert_has "stopped $service is explicitly restarted (legacy=$legacy)" "$CALLS" "scale deployment fluid-$service --replicas="
      done
    done
    cp "$AZURE_DIR/routerlicious-values.yaml" "$REL_DIR/deployment/azure/routerlicious-values.yaml"
    if PATH="$REALPATH" helm template r "$CH" -f "$VALS" > "$WORK/render.yaml" 2>"$WORK/render.err"; then
      ok "helm template renders the patched chart"
      absorb < <(python3 - "$WORK/render.yaml" <<'PY'
import sys, yaml, json
cm = [d for d in yaml.safe_load_all(open(sys.argv[1]))
      if d and d.get('kind') == 'ConfigMap' and 'config.json' in (d.get('data') or {})][0]
raw = cm['data']['config.json']; c = json.loads(raw)
for name, good in [
  ("rendered kafka.lib.endpoint is the Event Hubs host", c['kafka']['lib']['endpoint'] == 'mock-eventhubs.servicebus.windows.net:9093'),
  ("rendered eventHubConnString is empty (env fills it)", c['kafka']['lib'].get('eventHubConnString') == ''),
  ("rendered numberOfPartitions is 32", c['kafka']['lib']['numberOfPartitions'] == 32),
  ("rendered Alfred preserves requested document IDs", c['alfred']['enforceServerGeneratedDocumentId'] is False),
  ("ignoreCheckpointFlushException present", c['checkpoints']['ignoreCheckpointFlushException'] is True),
  ("no SharedAccessKey anywhere in the ConfigMap", 'SharedAccessKey' not in raw),
]:
    print(("PASS " if good else "FAIL ") + name)
PY
)
    else
      no "helm template renders the patched chart" "$(tail -3 "$WORK/render.err")"
    fi
  else
    skip "chart patch + helm render" "could not clone FluidFramework (offline?)"
  fi
else
  skip "chart patch + helm render" "helm or git not installed"
fi

# ---------------------------------------------------------------------------
group "11. Preflight gates"
# ---------------------------------------------------------------------------
P="$AZURE_DIR/preflight-check.sh"
grep -q "eventhubs namespace exists"   "$P" && ok "preflight checks global namespace-name availability" || no "preflight checks global namespace-name availability"
grep -q "has no Kafka endpoint"        "$P" && ok "preflight rejects the Basic SKU"                     || no "preflight rejects the Basic SKU"
grep -q "no Availability Zone support" "$P" && ok "preflight gates zoneRedundant on region AZ support"  || no "preflight gates zoneRedundant on region AZ support"
grep -q "create-time only"             "$P" && ok "preflight warns zoneRedundant cannot change later"   || no "preflight warns zoneRedundant cannot change later"
grep -q "Microsoft.Cache/redisEnterprise" "$P" && ok "preflight checks Azure Managed Redis names"       || no "preflight checks Azure Managed Redis names"
grep -q 'load_redis_config "$PARAMS_FILE"' "$P" && ok "preflight uses shared Redis config validation" || no "preflight uses shared Redis config validation"
grep -q "must be exactly 'Enabled' or 'Disabled'" "$AZURE_DIR/redis-helpers.sh" && ok "preflight validates Redis highAvailability" || no "preflight validates Redis highAvailability"

PREFLIGHT_FAIL_BIN="$WORK/preflight-fail-bin"
mkdir -p "$PREFLIGHT_FAIL_BIN"
cat > "$PREFLIGHT_FAIL_BIN/mktemp" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
chmod +x "$PREFLIGHT_FAIL_BIN/mktemp"
preflight_mktemp_out="$(PATH="$PREFLIGHT_FAIL_BIN:$PATH" bash "$P" "$WORK/missing-parameters.json" 2>&1)"
preflight_mktemp_rc=$?
assert_eq "preflight exits when its private temporary directory cannot be created" "$preflight_mktemp_rc" "1"
if grep -qF "ERROR: could not create a private preflight temporary directory." <<<"$preflight_mktemp_out"; then
  ok "preflight reports temporary-directory creation failures"
else
  no "preflight reports temporary-directory creation failures" "$preflight_mktemp_out"
fi

group "12. Redis migration"
export MOCK_DEPLOYMENT_REPLICAS=0
export MOCK_SOURCE_PARAMS="$CACHE_PARAMS"
export MOCK_DEPLOYMENTS="$WORK/deployments.json"
jq '.builtImages = [
  {name:"routerlicious",status:"pinned",tag:"mock-tag",digest:("sha256:" + ("b" * 64))},
  {name:"historian",status:"pinned",tag:"mock-tag",digest:("sha256:" + ("c" * 64))},
  {name:"gitrest",status:"pinned",tag:"mock-tag",digest:("sha256:" + ("d" * 64))}
]' "$REL_DIR/images.json" > "$WORK/migration-images.json"
cp "$WORK/migration-images.json" "$REL_DIR/images.json"
jq -n '{
  items: [("fluid-alfred","fluid-nexus","fluid-riddler","fluid-deli","fluid-scribe","fluid-scriptorium","gitrest","historian") as $name |
    {metadata:{name:$name}, spec:{
      selector:{matchLabels:{app:$name}},
      template:{spec:{containers:[{
        name:$name,
        image:("mockacr.azurecr.io/" + (if ($name | startswith("fluid-")) then "routerlicious" else $name end) + ":mock-tag"),
        env:[{name:"redis__host",value:"mock-cache.redis.cache.windows.net"}]
      }]}}
    }}]
}' > "$MOCK_DEPLOYMENTS"

run_migration() {
  run_phase '
    . "$SELFHOST_ROOT/azure/migrate-redis.sh"
    REDIS_SOURCE_PARAMS="$MOCK_SOURCE_PARAMS"
    sleep() { echo "migration wait $*" >> "$CALLS"; }
    probe_managed_redis() { echo "migration probe" >> "$CALLS"; return "${MOCK_PROBE_FAILURE:-0}"; }
    phase5_helm() { echo "migration helm $REDIS_HOSTNAME:$REDIS_PORT" >> "$CALLS"; return "${MOCK_HELM_FAILURE:-0}"; }
    publish_frontdoor_hostnames() { echo "migration frontdoor" >> "$CALLS"; }
    verify_frontdoor_origin_health() { echo "migration healthy" >> "$CALLS"; }
    migrate_redis
  ' "${1:-$PARAMS}"
}

cp "$MOCK_DEPLOYMENTS" "$WORK/tagged-deployments.json"
jq --slurpfile release "$REL_DIR/images.json" '
  .items |= map(
    (.metadata.name | if startswith("fluid-") then "routerlicious" else . end) as $component |
    ($release[0].builtImages[] | select(.name == $component) | .digest) as $digest |
    .spec.template.spec.containers[0].image = ("mockacr.azurecr.io/" + $component + "@" + $digest)
  )
' "$MOCK_DEPLOYMENTS" > "$WORK/digest-deployments.json"

: > "$CALLS"
out="$(run_migration)"; rc=$?
assert_eq "Redis migration completes against mocked infrastructure" "$rc" "0"
assert_has "migration resolves the workload identity object ID" "$CALLS" "--query principalId"
assert_has "real Key Vault phase uses the principal ID for RBAC" "$CALLS" "properties.principalId=='mock-principal'"
assert_has "real secrets phase applies the SecretProviderClass" "$CALLS" "/secretproviderclass.yaml"
assert_has "real HPA phase applies autoscaling configuration" "$CALLS" "/hpa.yaml"
assert_has "real Key Vault phase succeeds during migration" <(printf '%s' "$out") "Phase 8 (Key Vault) VERIFY passed"
assert_has "real Key Vault lockdown succeeds during migration" <(printf '%s' "$out") "Phase 8 (Key Vault lockdown) VERIFY passed"
assert_has "migration retains old cache for manual deletion" <(printf '%s' "$out") "Neither Redis resource was deleted"
assert_has "migration applies AMR credentials" "$CALLS" "keyvault secret set --vault-name mock-kv --name redis-password --file"
assert_has "migration applies AMR endpoint and port to Helm" "$CALLS" "migration helm mock-redis.centralus.redis.azure.net:10000"
assert_eq "migration waits for all eight workloads to roll out" "$(grep -c 'rollout status deployment/' "$CALLS")" "8"
assert_eq "migration waits for all eight old pod selectors to disappear" "$(grep -c 'wait --for=delete pod --selector' "$CALLS")" "8"
assert_has "migration explicitly restarts stopped gitrest" "$CALLS" "scale deployment gitrest --replicas=1"
assert_has "migration explicitly restarts stopped historian" "$CALLS" "scale deployment historian --replicas="
absorb < <(python3 - "$CALLS" <<'PY'
import sys
calls = open(sys.argv[1]).read().splitlines()
find = lambda text: next(i for i, line in enumerate(calls) if text in line)
checks = [
    ("AMR provider validation precedes creation", find("/validate?") < find("redisenterprise create -n")),
    ("AMR provisioning and connectivity probe precede stopping workloads", find("redisenterprise create -n") < find("migration probe") < find("scale deployment")),
    ("persistent cutover marker precedes stopping workloads", find("tag update") < find("scale deployment")),
    ("all old pods are gone before changing the live key", max(i for i, line in enumerate(calls) if "get pods --selector" in line) < find("keyvault secret set")),
    ("key switch precedes consumers restarting", find("keyvault secret set") < find("apply -f") < find("migration helm")),
    ("migration checks application health last", find("rollout status") < find("migration healthy")),
    ("neither Redis resource is deleted", not any("redis delete" in line or "redisenterprise delete" in line for line in calls)),
]
for name, passed in checks:
    print(("PASS " if passed else "FAIL ") + name)
PY
)

for reference in digest mixed component-tags; do
  cp "$WORK/migration-images.json" "$REL_DIR/images.json"
  case "$reference" in
    digest) cp "$WORK/digest-deployments.json" "$MOCK_DEPLOYMENTS" ;;
    mixed)
      jq '.items[0].spec.template.spec.containers[0].image = "mockacr.azurecr.io/routerlicious:mock-tag"' \
        "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    component-tags)
      jq '.builtImages |= map(.tag = ("tag-" + .name))' "$WORK/migration-images.json" > "$REL_DIR/images.json"
      jq '.items |= map(
        (.metadata.name | if startswith("fluid-") then "routerlicious" else . end) as $component |
        .spec.template.spec.containers[0].image = ("mockacr.azurecr.io/" + $component + ":tag-" + $component)
      )' "$WORK/tagged-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
  esac
  : > "$CALLS"
  out="$(run_migration)"; rc=$?
  assert_eq "migration accepts $reference release image references" "$rc" "0"
  assert_has "$reference migration reaches application health checks" "$CALLS" "migration healthy"
done

cp "$WORK/tagged-deployments.json" "$MOCK_DEPLOYMENTS"
cp "$WORK/migration-images.json" "$REL_DIR/images.json"
for preparation in existing-target creating-target missing-database updating-database failed-endpoint updating-endpoint; do
  export MOCK_REDIS_EXISTS=1 MOCK_REDIS_STATE=Succeeded MOCK_DATABASE_MISSING=0 MOCK_DATABASE_STATE="" MOCK_PE_STATE=""
  case "$preparation" in
    creating-target) export MOCK_REDIS_STATE=Creating ;;
    missing-database) export MOCK_DATABASE_MISSING=1 ;;
    updating-database) export MOCK_DATABASE_STATE=Updating ;;
    failed-endpoint) export MOCK_PE_STATE=Failed ;;
    updating-endpoint) export MOCK_PE_STATE=Updating ;;
  esac
  : > "$CALLS"
  out="$(run_migration)"; rc=$?
  assert_eq "migration resumes $preparation" "$rc" "0"
  assert_has "$preparation reaches application health checks" "$CALLS" "migration healthy"
  if grep -q 'redisenterprise create -n\|/validate?' "$CALLS"; then
    no "$preparation does not recreate or capacity-check an allocated AMR"
  else ok "$preparation does not recreate or capacity-check an allocated AMR"; fi
  case "$preparation" in
    creating-target) assert_has "in-progress AMR provisioning is awaited" "$CALLS" "redisenterprise wait" ;;
    missing-database) assert_has "missing default database is created" "$CALLS" "redisenterprise database create" ;;
    updating-database) assert_has "in-progress database provisioning is awaited" "$CALLS" "migration wait 10" ;;
    failed-endpoint) assert_has "failed endpoint is reprovisioned" "$CALLS" "private-endpoint create" ;;
    updating-endpoint)
      assert_has "in-progress endpoint provisioning is awaited" "$CALLS" "private-endpoint wait"
      if grep -q 'private-endpoint create -g mock-rg -n pe-mock-redis ' "$CALLS"; then no "in-progress endpoint is not overwritten"
      else ok "in-progress endpoint is not overwritten"; fi ;;
  esac
done
export MOCK_REDIS_EXISTS=0 MOCK_REDIS_STATE=Succeeded MOCK_DATABASE_MISSING=0 MOCK_DATABASE_STATE="" MOCK_PE_STATE=""

# Persist mocked resources between separate script processes, as Azure does after a failure.
export MOCK_RESOURCE_STATE_DIR="$WORK/migration-state"
mkdir -p "$MOCK_RESOURCE_STATE_DIR"
for preparation in endpoint-failure dns-failure probe-failure success; do
  export MOCK_PE_CREATE_FAILURE=0 MOCK_DNS_GROUP_FAILURE=0 MOCK_PROBE_FAILURE=0
  case "$preparation" in
    endpoint-failure) export MOCK_PE_CREATE_FAILURE=1 ;;
    dns-failure) export MOCK_DNS_GROUP_FAILURE=1 ;;
    probe-failure) export MOCK_PROBE_FAILURE=1 ;;
  esac
  : > "$CALLS"
  out="$(run_migration)"; rc=$?
  if [[ "$preparation" == success ]]; then
    assert_eq "repeated preparation retries eventually complete migration" "$rc" "0"
    assert_has "resumed migration performs application health checks" "$CALLS" "migration healthy"
  else
    [[ "$rc" != 0 ]] && ok "$preparation stops migration" || no "$preparation stops migration" "$out"
    if grep -q 'keyvault secret set\|scale deployment\|tag update' "$CALLS"; then
      no "$preparation preserves live source consumers and retry eligibility"
    else ok "$preparation preserves live source consumers and retry eligibility"; fi
  fi
  if [[ "$preparation" != endpoint-failure ]]; then
    if grep -q 'redisenterprise create -n' "$CALLS"; then no "$preparation reuses the AMR from the previous attempt"
    else ok "$preparation reuses the AMR from the previous attempt"; fi
  fi
  if [[ "$preparation" == dns-failure ]]; then
    assert_has "second attempt repairs the previous failed endpoint" "$CALLS" "private-endpoint create"
  elif [[ "$preparation" == probe-failure || "$preparation" == success ]]; then
    if grep -q 'private-endpoint create -g mock-rg -n pe-mock-redis ' "$CALLS"; then no "$preparation reuses the successful endpoint"
    else ok "$preparation reuses the successful endpoint"; fi
  fi
  if grep -qE 'az (redisenterprise|redis|network private-endpoint) delete' "$CALLS"; then
    no "$preparation does not delete cache or endpoint resources"
  else ok "$preparation does not delete cache or endpoint resources"; fi
done
: > "$CALLS"
out="$(run_migration)"; rc=$?
[[ "$rc" != 0 ]] && ok "persistent cutover marker prevents repeating a completed migration" || no "persistent cutover marker prevents repeating a completed migration"
assert_has "cutover rerun directs the user to recovery" <(printf '%s' "$out") "redis-migration-recovery.txt"
if grep -q 'keyvault secret set\|scale deployment\|redisenterprise create -n' "$CALLS"; then
  no "cutover rerun performs no resource creation or live changes"
else ok "cutover rerun performs no resource creation or live changes"; fi

rm -f "$MOCK_RESOURCE_STATE_DIR/cutover"
export MOCK_HELM_FAILURE=1
: > "$CALLS"
out="$(run_migration)"; rc=$?
[[ "$rc" != 0 ]] && ok "resumed migration retains its cutover marker after a Helm failure" || no "resumed migration retains its cutover marker after a Helm failure"
assert_has "failed cutover identifies recovery instructions" <(printf '%s' "$out") "redis-migration-recovery.txt"
export MOCK_HELM_FAILURE=0
: > "$CALLS"
out="$(run_migration)"; rc=$?
[[ "$rc" != 0 ]] && ok "next invocation refuses to repeat a failed cutover" || no "next invocation refuses to repeat a failed cutover"
if grep -q 'keyvault secret set\|scale deployment\|redisenterprise create -n' "$CALLS"; then
  no "failed-cutover retry leaves recovery state untouched"
else ok "failed-cutover retry leaves recovery state untouched"; fi
unset MOCK_RESOURCE_STATE_DIR

for scenario in capacity probe pods invalid-pods secret helm missing-client-id missing-principal-id identity-read-failure wrong-location wrong-sku wrong-ha public-target cutover-started failed-cluster endpoint-resource endpoint-subnet endpoint-group endpoint-retry endpoint-deleting endpoint-wait dns-group database-list database-eviction database-stuck unapproved-endpoint tag-failure stopped-workload wrong-release wrong-digest wrong-registry wrong-component missing-image ambiguous-image wrong-source-cache missing-workload missing-selector mismatched-config; do
  cp "$WORK/tagged-deployments.json" "$MOCK_DEPLOYMENTS"
  cp "$WORK/migration-images.json" "$REL_DIR/images.json"
  export MOCK_PREFLIGHT_FAILURE=0 MOCK_PROBE_FAILURE=0 MOCK_PODS_REMAIN=0 MOCK_PODS_INVALID=0 MOCK_SECRET_EXIT=0 MOCK_HELM_FAILURE=0 MOCK_REDIS_EXISTS=0
  export MOCK_TARGET_LOCATION=centralus MOCK_TARGET_SKU=Balanced_B5 MOCK_REDIS_HA=Enabled MOCK_TARGET_PUBLIC=Disabled MOCK_CUTOVER_STARTED=0 MOCK_REDIS_STATE=Succeeded
  export MOCK_PE_STATE="" MOCK_PE_MISMATCH="" MOCK_PE_CREATE_FAILURE=0 MOCK_PE_WAIT_FAILURE=0 MOCK_DNS_GROUP_FAILURE=0 MOCK_DATABASE_LIST_FAILURE=0 MOCK_DATABASE_EVICTION=VolatileLRU MOCK_DATABASE_STATE="" MOCK_PE_APPROVAL=Approved MOCK_TAG_FAILURE=0
  export MOCK_IDENTITY_CLIENT_ID=mock-client MOCK_IDENTITY_PRINCIPAL_ID=mock-principal MOCK_IDENTITY_EXIT=0
  target="$PARAMS"
  case "$scenario" in
    capacity) export MOCK_PREFLIGHT_FAILURE=1 ;;
    probe) export MOCK_PROBE_FAILURE=1 ;;
    pods) export MOCK_PODS_REMAIN=1 ;;
    invalid-pods) export MOCK_PODS_INVALID=1 ;;
    secret) export MOCK_SECRET_EXIT=1 ;;
    helm) export MOCK_HELM_FAILURE=1 ;;
    missing-client-id) export MOCK_IDENTITY_CLIENT_ID="" ;;
    missing-principal-id) export MOCK_IDENTITY_PRINCIPAL_ID="" ;;
    identity-read-failure) export MOCK_IDENTITY_EXIT=1 ;;
    wrong-location) export MOCK_REDIS_EXISTS=1 MOCK_TARGET_LOCATION=eastus ;;
    wrong-sku) export MOCK_REDIS_EXISTS=1 MOCK_TARGET_SKU=Balanced_B10 ;;
    wrong-ha) export MOCK_REDIS_EXISTS=1 MOCK_REDIS_HA=Disabled ;;
    public-target) export MOCK_REDIS_EXISTS=1 MOCK_TARGET_PUBLIC=Enabled ;;
    cutover-started) export MOCK_REDIS_EXISTS=1 MOCK_CUTOVER_STARTED=1 ;;
    failed-cluster) export MOCK_REDIS_EXISTS=1 MOCK_REDIS_STATE=Failed ;;
    endpoint-resource|endpoint-subnet|endpoint-group)
      export MOCK_PE_STATE=Failed MOCK_PE_MISMATCH="${scenario#endpoint-}" ;;
    endpoint-wait) export MOCK_PE_STATE=Updating MOCK_PE_WAIT_FAILURE=1 ;;
    endpoint-retry) export MOCK_PE_STATE=Failed MOCK_PE_CREATE_FAILURE=1 ;;
    endpoint-deleting) export MOCK_PE_STATE=Deleting ;;
    dns-group) export MOCK_DNS_GROUP_FAILURE=1 ;;
    database-list) export MOCK_DATABASE_LIST_FAILURE=1 ;;
    database-eviction) export MOCK_DATABASE_EVICTION=AllKeysLRU ;;
    database-stuck) export MOCK_DATABASE_STATE=stuck ;;
    unapproved-endpoint) export MOCK_PE_APPROVAL=Rejected ;;
    tag-failure) export MOCK_TAG_FAILURE=1 ;;
    stopped-workload)
      jq '.items[0].spec.replicas = 0' "$WORK/tagged-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    wrong-release)
      jq '.items[7].spec.template.spec.containers[0].image = "mockacr.azurecr.io/historian:other-tag"' \
        "$WORK/tagged-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    wrong-digest)
      jq '.items[7].spec.template.spec.containers[0].image = ("mockacr.azurecr.io/historian@sha256:" + ("e" * 64))' \
        "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    wrong-registry)
      jq '.items[7].spec.template.spec.containers[0].image |= sub("^mockacr"; "otheracr")' \
        "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    wrong-component)
      jq '.items[7].spec.template.spec.containers[0].image = .items[6].spec.template.spec.containers[0].image' \
        "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    missing-image)
      jq '.builtImages |= map(select(.name != "historian"))' "$WORK/migration-images.json" > "$REL_DIR/images.json" ;;
    ambiguous-image)
      jq '.builtImages += [.builtImages[1]]' "$WORK/migration-images.json" > "$REL_DIR/images.json" ;;
    wrong-source-cache)
      jq '.items[6].spec.template.spec.containers[0].env[0].value = "other-cache.redis.cache.windows.net"' \
        "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    missing-workload)
      jq 'del(.items[7])' "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    missing-selector)
      jq '.items[0].spec.selector.matchLabels = {}' "$WORK/digest-deployments.json" > "$MOCK_DEPLOYMENTS" ;;
    mismatched-config)
      target="$WORK/mismatched.json"
      jq '.resourceGroup = "different-rg"' "$PARAMS" > "$target" ;;
  esac
  : > "$CALLS"
  out="$(run_migration "$target")"; rc=$?
  [[ "$rc" != 0 ]] && ok "migration rejects $scenario" || no "migration rejects $scenario" "$out"
  case "$scenario" in
    capacity|wrong-location|wrong-sku|wrong-ha|public-target|cutover-started|failed-cluster|stopped-workload|wrong-release|wrong-digest|wrong-registry|wrong-component|missing-image|ambiguous-image|wrong-source-cache|missing-workload|missing-selector|mismatched-config)
      if grep -q 'redisenterprise create -n\|keyvault secret set\|scale deployment' "$CALLS"; then
        no "$scenario failure occurs before resource creation or live changes"
      else ok "$scenario failure occurs before resource creation or live changes"; fi ;;
    probe|missing-client-id|missing-principal-id|identity-read-failure|endpoint-resource|endpoint-subnet|endpoint-group|endpoint-retry|endpoint-deleting|endpoint-wait|dns-group|database-list|database-eviction|database-stuck|unapproved-endpoint|tag-failure)
      if grep -q 'keyvault secret set\|scale deployment' "$CALLS"; then no "$scenario failure leaves source consumers untouched"
      else ok "$scenario failure leaves source consumers untouched"; fi
      case "$scenario" in
        endpoint-resource|endpoint-subnet|endpoint-group)
          if grep -q 'private-endpoint create' "$CALLS"; then no "$scenario mismatch prevents endpoint modification"
          else ok "$scenario mismatch prevents endpoint modification"; fi ;;
      esac ;;
    pods|invalid-pods)
      if grep -q 'keyvault secret set' "$CALLS"; then no "remaining source pods prevent key switch"
      else ok "remaining source pods prevent key switch"; fi ;;
  esac
  case "$scenario" in
    pods|invalid-pods|secret|helm)
      assert_eq "$scenario failure freezes all workloads instead of splitting Pub/Sub" "$(grep -c 'scale deployment fluid-alfred fluid-nexus' "$CALLS")" "2"
      assert_has "$scenario failure identifies persistent recovery instructions" <(printf '%s' "$out") "redis-migration-recovery.txt" ;;
  esac
done
export MOCK_PREFLIGHT_FAILURE=0 MOCK_PROBE_FAILURE=0 MOCK_PODS_REMAIN=0 MOCK_PODS_INVALID=0 MOCK_SECRET_EXIT=0 MOCK_HELM_FAILURE=0 MOCK_REDIS_EXISTS=0

printf '\n\033[1mTotal: %d passed, %d failed, %d skipped\033[0m\n' "$PASS" "$FAIL" "$SKIP"
[[ $FAIL -eq 0 ]] || exit 1
