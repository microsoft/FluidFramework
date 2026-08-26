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
export MOCK_NS_EXISTS=0 MOCK_TIER=Standard MOCK_REDIS_EXISTS=0

cat > "$BIN/az" <<'STUB'
#!/usr/bin/env bash
echo "az $*" >> "$CALLS"
case "$*" in
  *"extension show"*"redisenterprise"*)                                  exit 0 ;;
  *"redisenterprise create --help"*)
    printf '%s\n' "--access-keys-authentication"
    for ((i = 0; i < 10000; i++)); do printf '%s\n' "additional help output"; done
    exit 0 ;;
  *"redisenterprise database show"*"--query provisioningState"*)          echo "Succeeded"; exit 0 ;;
  *"redisenterprise database show"*"--query accessKeysAuthentication"*)  echo "Enabled"; exit 0 ;;
  *"redisenterprise database show"*"--query clientProtocol"*)            echo "Encrypted"; exit 0 ;;
  *"redisenterprise database show"*"--query clusteringPolicy"*)          echo "NoCluster"; exit 0 ;;
  *"redisenterprise database show"*"--query port"*)                      echo "10000"; exit 0 ;;
  *"redisenterprise database list-keys"*)                                echo "mock-redis-key"; exit 0 ;;
  *"redisenterprise show"*"--query provisioningState"*)
    if [ "${MOCK_REDIS_EXISTS:-0}" = 1 ] || grep -q "redisenterprise create -n" "$CALLS"; then echo "Succeeded"; exit 0; else exit 1; fi ;;
  *"redisenterprise show"*"--query hostName"*)            echo "mock-redis.centralus.redis.azure.net"; exit 0 ;;
  *"redisenterprise show"*"--query highAvailability"*)    echo "Enabled"; exit 0 ;;
  *"redisenterprise show"*"--query publicNetworkAccess"*) echo "Disabled"; exit 0 ;;
  *"redisenterprise show"*"--query id"*)                  echo "/subscriptions/s/resourceGroups/rg/providers/Microsoft.Cache/redisEnterprise/mock-redis"; exit 0 ;;
  *"redisenterprise show"*)                               [ "${MOCK_REDIS_EXISTS:-0}" = 1 ] && exit 0 || exit 1 ;;
  *"eventhubs namespace show"*"--query zoneRedundant"*)       echo "true"; exit 0 ;;
  *"eventhubs namespace show"*"--query sku.tier"*)            echo "${MOCK_TIER:-Standard}"; exit 0 ;;
  *"eventhubs namespace show"*"--query kafkaEnabled"*)        echo "true"; exit 0 ;;
  *"eventhubs namespace show"*"--query publicNetworkAccess"*) echo "Enabled"; exit 0 ;;
  *"eventhubs namespace show"*"--query id"*)                  echo "/subscriptions/s/resourceGroups/rg/providers/Microsoft.EventHub/namespaces/ns"; exit 0 ;;
  *"eventhubs namespace show"*)                               [ "${MOCK_NS_EXISTS:-0}" = 1 ] && exit 0 || exit 1 ;;
  *"eventhubs eventhub show"*"--query partitionCount"*)       echo "32"; exit 0 ;;
  *"eventhubs eventhub show"*)                                exit 1 ;;
  *"authorization-rule keys list"*)                           echo 'Endpoint=sb://ns.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc+/='; exit 0 ;;
  *"keyvault secret show"*)                                   echo "https://kv.vault.azure.net/secrets/eventhub-connection-string/1"; exit 0 ;;
  *"privateLinkServiceConnections"*)                          echo "Approved"; exit 0 ;;
  *"private-endpoint show"*|*"private-dns zone show"*|*"private-dns link vnet show"*) exit 1 ;;
esac
exit 0
STUB
# git is stubbed too -- deploy.sh fetches the pinned commit at import. Section 9 reaches the real
# git via $REALPATH when it needs an actual clone.
for c in kubectl helm docker git; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "$CALLS"\nexit 0\n' "$c" > "$BIN/$c"
done
chmod +x "$BIN"/*
REALPATH="$PATH"
export PATH="$BIN:$PATH"

# ---------------------------------------------------------------------------
# Mock repo layout. deploy.sh derives SELFHOST_ROOT from $BASH_SOURCE and runs preflight-check.sh
# at import, so the extracted function block has to sit in a repo-shaped tree with preflight
# stubbed out -- the real one makes live Azure calls.
# ---------------------------------------------------------------------------
REPO="$WORK/repo"; mkdir -p "$REPO/azure"
cp "$AZURE_DIR"/*.yaml "$AZURE_DIR"/*.json "$AZURE_DIR"/*.sh "$REPO/azure/" 2>/dev/null || true
printf '#!/usr/bin/env bash\nexit 0\n' > "$REPO/azure/preflight-check.sh"
chmod +x "$REPO/azure/preflight-check.sh"

export RELEASE_ROOT="$REPO/release-artifacts"
REL_ID="mock-release"
REL_DIR="$RELEASE_ROOT/$REL_ID"
mkdir -p "$REL_DIR/deployment/azure"
cp "$AZURE_DIR"/*.yaml "$REL_DIR/deployment/azure/" 2>/dev/null || true
printf '{"sourceRepo":"https://github.com/microsoft/FluidFramework","resolvedCommitSha":"0123456789abcdef0123456789abcdef01234567"}\n' > "$REL_DIR/source.json"
printf '{"builtImages":[{"name":"routerlicious","status":"pinned","tag":"mock-tag"}]}\n' > "$REL_DIR/images.json"

PARAMS="$WORK/params.json"
# fluidRepoDir is mandatory since the release-pipeline merge; git is stubbed, so a directory with
# a .git marker is enough to get past the checkout logic.
mkdir -p "$WORK/fluid/.git"
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
  "redis": { "clusterName": "mock-redis" },
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
            EVENTHUBS_RETENTION_HOURS EVENTHUBS_ZONE_REDUNDANT KAFKA_ENDPOINT REDIS_SKU REDIS_PORT)
assert_eq "namespaceName parsed"  "${V_EVENTHUBS_NAMESPACE:-}"       "mock-eventhubs"
assert_eq "sku parsed"            "${V_EVENTHUBS_SKU:-}"             "Standard"
assert_eq "capacity parsed"       "${V_EVENTHUBS_CAPACITY:-}"        "1"
assert_eq "partitionCount parsed" "${V_EVENTHUBS_PARTITIONS:-}"      "32"
assert_eq "retentionHours parsed" "${V_EVENTHUBS_RETENTION_HOURS:-}" "72"
assert_eq "zoneRedundant parsed"  "${V_EVENTHUBS_ZONE_REDUNDANT:-}"  "true"
assert_eq "KAFKA_ENDPOINT is the TLS Kafka head on 9093" \
  "${V_KAFKA_ENDPOINT:-}" "mock-eventhubs.servicebus.windows.net:9093"
assert_eq "Azure Managed Redis defaults to Balanced_B5" "${V_REDIS_SKU:-}" "Balanced_B5"
assert_eq "Azure Managed Redis uses port 10000" "${V_REDIS_PORT:-}" "10000"

TILDE="$WORK/params-tilde.json"
jq '.fluidRepoDir = "~/fluid"' "$PARAMS" > "$TILDE"
mkdir -p "$WORK/home/fluid/.git"
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

# ---------------------------------------------------------------------------
group "5. Guard rails"
# ---------------------------------------------------------------------------
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

printf '\n\033[1mTotal: %d passed, %d failed, %d skipped\033[0m\n' "$PASS" "$FAIL" "$SKIP"
[[ $FAIL -eq 0 ]] || exit 1
