#!/usr/bin/env bash
# azure/deploy.sh — automated end-to-end deployment of the self-host Fluid stack to AKS.
#
# Reads inputs from a JSON parameters file (default: azure/deploy.parameters.json, gitignored
# — copy azure/deploy.parameters.example.json to create your own) and runs the validated
# azure/README.md runbook (Phases 0-6, 8, 10, 12): a customer-managed VNet (dedicated AKS-node
# and private-endpoint subnets), resource group + ACR, release-image import into ACR, AKS (AAD Workload
# Identity), ACR hardening, Key Vault, Cosmos DB for MongoDB, Azure Cache for Redis, Storage
# Account, Azure Event Hubs, in-cluster backends, Helm install with CSI-mounted secrets,
# LoadBalancer exposure, HPA, and Azure Front Door.
#
# Identity + network posture (see phase8_workload_identity / phase0_network for details):
#   - One user-assigned managed identity, federated via AAD Workload Identity to a single
#     ServiceAccount, is what every app pod uses to reach Key Vault. ACR pulls and the Azure
#     Files CSI driver's storage-key retrieval use the AKS kubelet/cluster identities instead
#     (system-component operations, not workload-identity-federatable).
#   - Key Vault, Cosmos DB, Redis, and the Storage Account get Private Endpoints into the AKS
#     subnet with public network access disabled.
#   - phase0_network_allow_frontdoor allows Azure Front Door's backend network through the
#     subnet's policy-attached NSG (some Azure environments have a policy that restricts new
#     subnets to internal-network-only by default), or Front Door marks every origin unhealthy.
#   - Cosmos DB and Redis stay credential-based (connection string/password): the Fluid
#     server's Redis client has no Entra ID code path, and some Azure Policy configurations
#     require the EnableMongo capability to be explicitly declared for local auth. The Storage
#     Account keeps `allowSharedKeyAccess=true` since the Azure Files CSI driver's SMB mount has
#     no Entra-ID-only path. Both secrets are Key-Vault-stored and CSI-mounted, never a static
#     Kubernetes Secret.
#
# NOT covered (explicit scope decision): Phase 7 (token service), Front Door custom domain +
# DNS validation, PowerShell version. The stack this script deploys has no token backend, so a
# client must supply its own. token-service/deploy-token-service.sh deploys a reference Entra ID
# token service separately; it is opt-in because that backend is customer-operated.
#
# This is an automation of a validated *reference* deployment, not a production-ready product.
# Re-running this script is safe — each phase checks whether its resource already exists before
# creating it. Runs azure/preflight-check.sh first and aborts before any mutating phase if it
# reports a failure; run preflight-check.sh on its own any time to check a parameters file
# without committing to a deploy.
#
# Two modes (see --mode):
#   full   (default) — NEW deployment: no Azure infrastructure exists yet. Runs every phase (customer VNet,
#                      AKS, ACR, Key Vault, Cosmos, Redis, Storage, then the release rollout).
#   deploy-only      — the Azure/AKS infrastructure is already present, so skip every
#                      infrastructure phase and run only the release-deployment phases from the
#                      given release bundle under release-artifacts/
#
# Usage: azure/deploy.sh [--mode full|deploy-only] <release-id> [path/to/deploy.parameters.json]
#   --mode full   (default; aliases: --new / --full)
#   --mode deploy-only
set -euo pipefail

# ---------------------------------------------------------------------------
# Setup: locate this repo, release bundle and parameters file, and a scratch directory for rendered
# manifests + logs (never commit rendered files with live values).
# ---------------------------------------------------------------------------
SELFHOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat >&2 <<'EOF'
Usage: azure/deploy.sh [--mode full|deploy-only] <release-id> [path/to/deploy.parameters.json]

  --mode full     new deployment: create Azure infrastructure and deploy the release (default)
                  aliases: --new, --full
  --mode deploy-only
                  deploy only the release bundle onto existing Azure/AKS infrastructure
  -h, --help      show this help
EOF
}

# Deployment mode
MODE=full
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)                       MODE="${2:-}"; shift 2 ;;
    --mode=*)                     MODE="${1#*=}"; shift ;;
    --new|--full)                 MODE=full; shift ;;
    --deploy-only)                 MODE=deploy-only; shift ;;
    -h|--help)                    usage; exit 0 ;;
    --)                           shift; while [[ $# -gt 0 ]]; do POSITIONAL+=("$1"); shift; done ;;
    -*)                           echo "ERROR: unknown option '$1'" >&2; usage; exit 1 ;;
    *)                            POSITIONAL+=("$1"); shift ;;
  esac
done
set -- ${POSITIONAL[@]+"${POSITIONAL[@]}"}

case "$MODE" in
  full|new)                          MODE=full ;;
  deploy-only)                      MODE=deploy-only ;;
  *) echo "ERROR: invalid --mode '$MODE' (expected 'full' or 'deploy-only')" >&2; usage; exit 1 ;;
esac

RELEASE_ID="${1:-}"
PARAMS_FILE="${2:-$SELFHOST_ROOT/azure/deploy.parameters.json}"

if [[ -z "$RELEASE_ID" ]]; then
  echo "ERROR: no release id given." >&2
  usage
  exit 1
fi

if [[ ! -f "$PARAMS_FILE" ]]; then
  echo "ERROR: parameters file not found: $PARAMS_FILE" >&2
  echo "Copy azure/deploy.parameters.example.json to azure/deploy.parameters.json and fill it in." >&2
  exit 1
fi

RELEASE_ROOT="${RELEASE_ROOT:-$SELFHOST_ROOT/release-artifacts}"
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_ID"
RELEASE_DEPLOYMENT_DIR="$RELEASE_DIR/deployment"
SOURCE_FILE="$RELEASE_DIR/source.json"
IMAGES_FILE="$RELEASE_DIR/images.json"

# Validate release bundle inputs
[[ -d "$RELEASE_DIR" ]] || { echo "ERROR: release not found: $RELEASE_DIR" >&2; exit 1; }
[[ -f "$SOURCE_FILE" ]] || { echo "ERROR: missing $SOURCE_FILE (run release/pin-source.sh)" >&2; exit 1; }
[[ -f "$IMAGES_FILE" ]] || { echo "ERROR: missing $IMAGES_FILE (run release/pin-images.sh)" >&2; exit 1; }
[[ -d "$RELEASE_DEPLOYMENT_DIR" ]] || { echo "ERROR: missing $RELEASE_DEPLOYMENT_DIR (run release/pin-images.sh)" >&2; exit 1; }

pending_built="$(jq -r '[.builtImages[]? | select(.status != "pinned") | .name] | join(", ")' "$IMAGES_FILE")"
if [[ -n "$pending_built" ]]; then
  echo "ERROR: release '$RELEASE_ID' has unpinned (pending-build) images: $pending_built" >&2
  exit 1
fi

FLUID_REPO_URL="$(jq -r '.sourceRepo // empty' "$SOURCE_FILE")"
FLUID_REF="$(jq -r '.resolvedCommitSha // empty' "$SOURCE_FILE")"
[[ -n "$FLUID_REPO_URL" ]] || { echo "ERROR: source.json must contain sourceRepo" >&2; exit 1; }
[[ "$FLUID_REF" =~ ^[0-9a-f]{40}$ ]] || { echo "ERROR: source.json must contain a 40-char resolvedCommitSha" >&2; exit 1; }

IMAGE_TAG="$(jq -r '.builtImages[]? | select(.status == "pinned") | .tag // empty' "$IMAGES_FILE" | head -n 1)"
IMAGE_TAG="${IMAGE_TAG:-$RELEASE_ID}"

log()    { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
banner() { printf '\n=== %s ===\n' "$*"; }

# Idempotently grants a role assignment via a raw ARM REST existence check instead of
# `az role assignment list` -- some tenants' Conditional Access policies block the Microsoft
# Graph principal-name lookup that CLI command makes, even for a raw object ID.
# Filters by BOTH role definition AND exact scope, not just principalId -- the roleAssignments
# list at any scope also includes assignments inherited from ancestor scopes (RG/subscription),
# and e.g. subscription-level Owner does not imply Key Vault Secrets Officer (Owner's
# Actions:["*"] excludes DataActions), so a principalId-only check can wrongly skip a grant
# that's actually still needed.
ensure_role_assignment() {
  local principal_object_id="$1" principal_type="$2" role_name="$3" scope="$4"
  local role_def_id existing
  LAST_CREATED_ROLE_ID=""
  role_def_id="$(az role definition list --name "$role_name" --query '[0].name' -o tsv)"
  existing="$(az rest --method get \
    --url "https://management.azure.com${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01" \
    --query "value[?properties.principalId=='$principal_object_id' && contains(properties.roleDefinitionId, '$role_def_id') && properties.scope=='$scope'].id | [0]" -o tsv 2>/dev/null)"
  if [[ -n "$existing" ]]; then
    log "Role '$role_name' already granted to $principal_object_id at this scope, skipping"
  else
    LAST_CREATED_ROLE_ID="$(az role assignment create --assignee-object-id "$principal_object_id" \
      --assignee-principal-type "$principal_type" --role "$role_name" --scope "$scope" \
      --query id -o tsv)"
  fi
}

TEMP_ROLE_ASSIGNMENT_IDS=()
KV_PUBLIC_ACCESS_RESTORE=""

restore_keyvault_public_access() {
  [[ -n "$KV_PUBLIC_ACCESS_RESTORE" ]] || return 0
  log "Restoring Key Vault public network access to $KV_PUBLIC_ACCESS_RESTORE"
  az keyvault update -g "$RG" -n "$KV" \
    --public-network-access "$KV_PUBLIC_ACCESS_RESTORE" >/dev/null
  KV_PUBLIC_ACCESS_RESTORE=""
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

# Resolves the signed-in caller's AAD object ID by decoding the `oid` claim out of an ARM
# access token's JWT payload -- `az ad signed-in-user show` is blocked by the same Conditional
# Access policy as above, but ARM token issuance is unaffected.
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

# Azure RBAC role assignments can take a couple minutes to propagate after creation. Retry on
# Forbidden instead of failing the whole deployment over a timing race.
keyvault_secret_set_with_retry() {
  local vault="$1" name="$2" value="$3" attempt
  for attempt in 1 2 3 4 5 6; do
    if az keyvault secret set --vault-name "$vault" --name "$name" --value "$value" >/dev/null 2>/tmp/kv_secret_set_err.$$; then
      rm -f /tmp/kv_secret_set_err.$$
      return 0
    fi
    # A network-locked-down vault (public network access disabled) also contains the
    # substring "Forbidden" but retrying can never fix it -- fail immediately with a clear
    # pointer instead of burning ~90s on retries that cannot succeed.
    if grep -q "Public network access is disabled" /tmp/kv_secret_set_err.$$ 2>/dev/null; then
      cat /tmp/kv_secret_set_err.$$ >&2; rm -f /tmp/kv_secret_set_err.$$
      echo "ERROR: Key Vault $vault still has public network access disabled." >&2
      echo "phase8_keyvault should have enabled it temporarily for this workstation write; confirm the update was not blocked by Azure Policy." >&2
      return 1
    fi
    if ! grep -q "Forbidden\|ForbiddenByRbac" /tmp/kv_secret_set_err.$$ 2>/dev/null; then
      cat /tmp/kv_secret_set_err.$$ >&2; rm -f /tmp/kv_secret_set_err.$$
      return 1
    fi
    log "Key Vault secret '$name' set forbidden (likely RBAC propagation delay), retrying in 15s (attempt $attempt/6)"
    sleep 15
  done
  rm -f /tmp/kv_secret_set_err.$$
  echo "ERROR: could not set Key Vault secret '$name' after retries -- RBAC role may not have propagated" >&2
  return 1
}

# AKS allows only one mutating (PUT) operation on a managed cluster at a time. A concurrent
# operation (e.g. a previous deploy.sh attempt's own enable-addons call still finishing) makes
# a new one fail immediately with (OperationNotAllowed), not queue behind it. Observed addon
# operations taking 1-3 minutes to clear; retry budget below is sized with margin over that.
aks_enable_addon_with_retry() {
  local rg="$1" aks="$2" addon="$3" attempt
  for attempt in $(seq 1 10); do
    if az aks enable-addons -g "$rg" -n "$aks" --addons "$addon" 2>/tmp/aks_addon_err.$$; then
      rm -f /tmp/aks_addon_err.$$
      return 0
    fi
    if ! grep -q "OperationNotAllowed" /tmp/aks_addon_err.$$ 2>/dev/null; then
      cat /tmp/aks_addon_err.$$ >&2; rm -f /tmp/aks_addon_err.$$
      return 1
    fi
    log "AKS cluster $aks has another operation in progress, retrying '$addon' addon enable in 30s (attempt $attempt/10)"
    sleep 30
  done
  cat /tmp/aks_addon_err.$$ >&2; rm -f /tmp/aks_addon_err.$$
  echo "ERROR: could not enable '$addon' addon on $aks after retries -- another operation may be stuck (check with 'az aks operation show-latest -g $rg -n $aks')" >&2
  return 1
}

# ---------------------------------------------------------------------------
# Preflight: required tools
# ---------------------------------------------------------------------------
banner "Preflight checks"
REQUIRED_TOOLS=(az kubectl helm docker jq openssl git python3 curl)
missing=()
for t in "${REQUIRED_TOOLS[@]}"; do
  command -v "$t" >/dev/null 2>&1 || missing+=("$t")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: missing required tools: ${missing[*]}" >&2
  exit 1
fi
log "All required tools found: ${REQUIRED_TOOLS[*]}"

# ---------------------------------------------------------------------------
# Preflight: read-only Azure/Helm validation (azure/preflight-check.sh). Catches quota
# shortfalls, globally-unique name conflicts (including Key Vault/Cosmos DB soft-delete
# blocks), and Helm chart/values rendering errors before any phase below creates, modifies,
# or deletes anything. Aborts here on failure rather than partway through a real deploy.
# ---------------------------------------------------------------------------
banner "Running preflight checks (azure/preflight-check.sh)"
if ! bash "$SELFHOST_ROOT/azure/preflight-check.sh" "$PARAMS_FILE"; then
  echo "ERROR: preflight checks failed -- fix the issues above before deploying" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Load parameters
# ---------------------------------------------------------------------------
jqr() { jq -r "$1 // empty" "$PARAMS_FILE"; }

SUB="$(jqr '.subscriptionId')"
RG="$(jqr '.resourceGroup')"
RG_LOC="$(jqr '.location')"
FLUID_REPO_DIR="$(jqr '.fluidRepoDir')"
ACR="$(jqr '.deployAcr.name')"
AKS="$(jqr '.aks.name')"
AKS_LOC="$(jqr '.aks.location')"; AKS_LOC="${AKS_LOC:-$RG_LOC}"
AKS_K8S_VERSION="$(jqr '.aks.kubernetesVersion')"; AKS_K8S_VERSION="${AKS_K8S_VERSION:-1.35}"
# free/standard/premium -- standard is the default since it's what adds the Uptime SLA (see
# phase1_aks); premium additionally extends Kubernetes version support lifecycle.
AKS_TIER="$(jqr '.aks.tier')"; AKS_TIER="${AKS_TIER:-standard}"
# None/Unmanaged/SecurityPatch/NodeImage -- defaults to None, NOT Azure's own default of
# NodeImage, because an unattended node-image rotation can silently take every node in a small
# pool down near-simultaneously (no surge capacity to rotate through one at a time). Confirmed
# via live testing: a NodeImage auto-upgrade's own `manualupgrade` operation preceded an
# all-nodes-NotReady crash by ~6.5 min, misreported by Resource Health as "Customer Initiated"
# since the CHANNEL SETTING is customer-configurable even though the upgrade itself was fully
# automatic. Override via aks.nodeOsUpgradeChannel if scheduled auto-upgrades are wanted instead.
AKS_NODE_OS_UPGRADE_CHANNEL="$(jqr '.aks.nodeOsUpgradeChannel')"; AKS_NODE_OS_UPGRADE_CHANNEL="${AKS_NODE_OS_UPGRADE_CHANNEL:-None}"
# Ubuntu/AzureLinux/etc, applies to both the system pool and gitrestpool (phase1_gitrest_nodepool)
# -- defaults to AzureLinux (Microsoft-maintained, smaller image/attack surface than Ubuntu). CAN
# be migrated in place on an EXISTING pool via `az aks nodepool update --os-sku`, but that's a
# rolling node-image replacement -- the same risk class as the NodeImage auto-upgrade crash above
# -- so it is deliberately NOT auto-retrofitted here; existing pools keep whatever OS they already
# have unless migrated on purpose. Override via aks.osSku.
AKS_OS_SKU="$(jqr '.aks.osSku')"; AKS_OS_SKU="${AKS_OS_SKU:-AzureLinux}"
# Spreads nodes across independent power/network/maintenance domains, applies to both the
# system pool and gitrestpool -- confirmed the recurring live "VM deallocated" incident
# correlates with an Azure Scheduled Events host-maintenance action that took down 2 nodes
# simultaneously; zones make that less
# likely to recur. Space-separated (matches `az aks create/nodepool add --zones`'s expected
# form) -- stored as a JSON array in parameters, same convention as redis.zones below, not a
# plain string. Create-time-only -- cannot be changed on an existing pool, see phase1_aks's
# retrofit check below. Override via aks.availabilityZones; set it to [] to opt out of zones
# entirely (deploy.sh omits --zones in that case, rather than falling back to the default --
# a plain `${VAR:-default}` can't tell "unset" apart from "explicitly empty", so the null
# check below is required to make [] actually mean "no zones").
if jq -e '.aks.availabilityZones == null' "$PARAMS_FILE" >/dev/null 2>&1; then
  AKS_ZONES="1 2 3"
else
  AKS_ZONES="$(jq -r '.aks.availabilityZones[]?' "$PARAMS_FILE" | tr '\n' ' ')"
fi
AKS_NODE_VM_SIZE="$(jqr '.aks.systemNodeVmSize')"; AKS_NODE_VM_SIZE="${AKS_NODE_VM_SIZE:-Standard_D4s_v3}"
AKS_NODE_COUNT="$(jqr '.aks.systemNodeCount')"; AKS_NODE_COUNT="${AKS_NODE_COUNT:-3}"
# Cluster autoscaler bounds -- min defaults to the fixed node count above, max is a starting
# point for the capacity target (design spec Section 4/7.9), not a load-test-derived final
# value. Override via aks.systemNodeMinCount/systemNodeMaxCount if needed.
AKS_NODE_MIN_COUNT="$(jqr '.aks.systemNodeMinCount')"; AKS_NODE_MIN_COUNT="${AKS_NODE_MIN_COUNT:-$AKS_NODE_COUNT}"
AKS_NODE_MAX_COUNT="$(jqr '.aks.systemNodeMaxCount')"; AKS_NODE_MAX_COUNT="${AKS_NODE_MAX_COUNT:-10}"
KV="$(jqr '.keyVault.name')"
COSMOS="$(jqr '.cosmos.clusterName')"
COSMOS_SERVER_VERSION="$(jqr '.cosmos.serverVersion')"; COSMOS_SERVER_VERSION="${COSMOS_SERVER_VERSION:-5.0}"
# Provisioned (autoscale), not Serverless -- Serverless has a hard 5,000 RU/s-per-container
# ceiling with no path to raise it. Provisioned is Cosmos DB's default capacity mode, so no
# --capacity-mode flag is passed at create time (older az CLIs don't have that parameter at
# all -- passing it fails with "unrecognized arguments"). Per-collection throughput below is a
# starting point for the capacity target, not a load-test-derived final value (design spec
# Section 4/7.9/9).
# Per-region zone redundancy -- requires a region with Availability Zone support, falls back
# to non-zone-redundant if create fails (see phase8_cosmos). Cannot be changed on an existing
# region entry afterwards, only set when a region is first added. Override via
# cosmos.zoneRedundant (string "True"/"False", matching `az cosmosdb create --locations
# isZoneRedundant=`'s expected casing directly, not a JSON boolean).
COSMOS_ZONE_REDUNDANT="$(jqr '.cosmos.zoneRedundant')"; COSMOS_ZONE_REDUNDANT="${COSMOS_ZONE_REDUNDANT:-True}"
# Per-collection max RU/s (autoscale) -- defaults match this reference deployment's own
# starting point (design spec Section 4/7.9/9), override any of these via
# cosmos.throughput.<name> without touching deploy.sh.
COSMOS_RU_DELTAS="$(jqr '.cosmos.throughput.deltas')"; COSMOS_RU_DELTAS="${COSMOS_RU_DELTAS:-80000}"
# Matches deltas. With checkpointHeuristics batching and localCheckpointEnabled routing
# active-session checkpoints to `checkpoints`, this collection measures 2-3% NormalizedRUConsumption.
COSMOS_RU_DOCUMENTS="$(jqr '.cosmos.throughput.documents')"; COSMOS_RU_DOCUMENTS="${COSMOS_RU_DOCUMENTS:-80000}"
COSMOS_RU_CHECKPOINTS="$(jqr '.cosmos.throughput.checkpoints')"; COSMOS_RU_CHECKPOINTS="${COSMOS_RU_CHECKPOINTS:-10000}"
COSMOS_RU_SCRIBE_DELTAS="$(jqr '.cosmos.throughput.scribeDeltas')"; COSMOS_RU_SCRIBE_DELTAS="${COSMOS_RU_SCRIBE_DELTAS:-4000}"
COSMOS_RU_TENANTS="$(jqr '.cosmos.throughput.tenants')"; COSMOS_RU_TENANTS="${COSMOS_RU_TENANTS:-4000}"
COSMOS_RU_NODES="$(jqr '.cosmos.throughput.nodes')"; COSMOS_RU_NODES="${COSMOS_RU_NODES:-4000}"
COSMOS_RU_RESERVATIONS="$(jqr '.cosmos.throughput.reservations')"; COSMOS_RU_RESERVATIONS="${COSMOS_RU_RESERVATIONS:-4000}"
REDIS="$(jqr '.redis.clusterName')"
REDIS_LOC="$(jqr '.redis.location')"; REDIS_LOC="${REDIS_LOC:-$RG_LOC}"
REDIS_SKU="$(jqr '.redis.sku')"; REDIS_SKU="${REDIS_SKU:-Premium}"
REDIS_VM_SIZE="$(jqr '.redis.vmSize')"; REDIS_VM_SIZE="${REDIS_VM_SIZE:-p1}"
# Engine version is pinned explicitly, not left on Azure's default, so the deployed version
# is reproducible. The classic/GA tier only offers 4.0 (legacy) and 6.0 (current).
REDIS_VERSION="$(jqr '.redis.version')"; REDIS_VERSION="${REDIS_VERSION:-6.0}"
# Replica count + zone redundancy are CREATE-TIME-ONLY on Azure Cache for Redis -- neither can
# be added to an existing cache. Falls back to no replicas/zones if the region/subscription
# can't satisfy them (see phase8_redis).
REDIS_REPLICAS_PER_MASTER="$(jqr '.redis.replicasPerMaster')"; REDIS_REPLICAS_PER_MASTER="${REDIS_REPLICAS_PER_MASTER:-3}"
# Same null-check as AKS_ZONES above (not a plain `${VAR:-default}`) -- an explicit
# redis.zones: [] means "opt out of zones", which must be told apart from the field being
# absent entirely, or [] would silently re-default to 2/3 instead of being respected.
if jq -e '.redis.zones == null' "$PARAMS_FILE" >/dev/null 2>&1; then
  REDIS_ZONES="2 3"
else
  REDIS_ZONES="$(jq -r '.redis.zones[]?' "$PARAMS_FILE" | tr '\n' ' ')"
fi
STORAGE="$(jqr '.storage.accountName')"
# Standard_ZRS (Zone-Redundant Storage) by default -- falls back to Standard_LRS if create
# fails (not all regions support ZRS, see phase8_storage). Cannot be changed on an existing
# account (`az storage account update --help`: SKU can't be updated to/from Standard_ZRS).
# Override via storage.sku.
STORAGE_SKU="$(jqr '.storage.sku')"; STORAGE_SKU="${STORAGE_SKU:-Standard_ZRS}"
# 20Ti default: a ceiling sized for sustained growth (no GC, repo-per-tenant pooling -- see
# azure/README.md "Production hardening"), not a pre-paid allocation -- Standard/pay-as-you-go
# Azure Files bills only actual bytes used, not this quota.
GITREST_STORAGE_QUOTA="$(jqr '.storage.gitrestQuota')"; GITREST_STORAGE_QUOTA="${GITREST_STORAGE_QUOTA:-20Ti}"
# Ordering backend is Azure Event Hubs over the Kafka protocol. Standard tier caps retention at 7
# days and partitions at 32 per hub.
EVENTHUBS_NAMESPACE="$(jqr '.kafka.eventHubs.namespaceName')"
EVENTHUBS_SKU="$(jqr '.kafka.eventHubs.sku')"; EVENTHUBS_SKU="${EVENTHUBS_SKU:-Standard}"
# 1 TU caps at 1 MB/s *or* 1000 events/s, whichever binds first. Measured load on this stack ran
# ~790 events/s -- 79% of a single TU on average, so ordinary bursts throttle. Throttled produces
# are not a soft failure here: they stall until delivery.timeout.ms, and that timeout is fatal,
# which restarts the process and reprocesses a partition. Start at 4 and let auto-inflate absorb
# bursts rather than sizing to the average.
EVENTHUBS_CAPACITY="$(jqr '.kafka.eventHubs.capacity')"; EVENTHUBS_CAPACITY="${EVENTHUBS_CAPACITY:-4}"
EVENTHUBS_AUTO_INFLATE="$(jqr '.kafka.eventHubs.autoInflate')"; EVENTHUBS_AUTO_INFLATE="${EVENTHUBS_AUTO_INFLATE:-true}"
EVENTHUBS_MAX_TU="$(jqr '.kafka.eventHubs.maxThroughputUnits')"; EVENTHUBS_MAX_TU="${EVENTHUBS_MAX_TU:-10}"
# Event Hubs Standard caps retention at 7 days and partitions at 32 per hub; 32 gives each of the
# 8 deli/scribe/scriptorium replicas four partitions.
EVENTHUBS_PARTITIONS="$(jqr '.kafka.eventHubs.partitionCount')"; EVENTHUBS_PARTITIONS="${EVENTHUBS_PARTITIONS:-32}"
EVENTHUBS_RETENTION_HOURS="$(jqr '.kafka.eventHubs.retentionHours')"; EVENTHUBS_RETENTION_HOURS="${EVENTHUBS_RETENTION_HOURS:-72}"
# Zone redundancy is enabled by default to match the production baseline for this stack.
# Create-time only -- Event Hubs cannot be made zone-redundant afterwards -- and it needs a
# region with Availability Zone support, so set kafka.eventHubs.zoneRedundant to false for
# regions without one rather than having the deploy fail.
EVENTHUBS_ZONE_REDUNDANT="$(jqr '.kafka.eventHubs.zoneRedundant')"; EVENTHUBS_ZONE_REDUNDANT="${EVENTHUBS_ZONE_REDUNDANT:-true}"
# librdkafka tuning taken from a production-validated baseline for this stack. It matters most
# for `connections.max.idle.ms`:
# Event Hubs drops idle connections at ~240s, and without a client idle timeout below that the
# broker closes the socket first and the client only finds out on the next produce/consume. The
# code reads these at kafka:lib:{consumer,producer}GlobalAdditionalConfig; they reach it as nconf
# `__` env vars, so no chart change is needed.
#
# Deliberately NOT included: `partition.assignment.strategy: cooperative-sticky`. The consumer
# supports it, but it is not production-validated for this stack and it changes rebalance
# behaviour -- add it only after proving it under real load.
KAFKA_TUNING_ENV_JSON="$(jq -nc \
  --arg consumer '{"connections.max.idle.ms":180000,"heartbeat.interval.ms":3000,"max.poll.interval.ms":300000,"metadata.max.age.ms":180000,"session.timeout.ms":30000}' \
  --arg producer '{"connections.max.idle.ms":180000,"delivery.timeout.ms":120050,"linger.ms":5,"message.max.bytes":1000000,"metadata.max.age.ms":180000,"request.timeout.ms":60000,"retries":4,"topic.metadata.refresh.interval.ms":60000}' \
  '[{name:"kafka__lib__consumerGlobalAdditionalConfig",value:$consumer},
    {name:"kafka__lib__producerGlobalAdditionalConfig",value:$producer},
    {name:"kafka__lib__rdkafkaConsumeLoopTimeoutDelay",value:"0"}]')"
# Broker endpoint handed to the chart as <KAFKA_ENDPOINT>. Event Hubs' Kafka head is always
# port 9093 with TLS.
KAFKA_ENDPOINT="${EVENTHUBS_NAMESPACE}.servicebus.windows.net:9093"
AFD="$(jqr '.frontDoor.profileName')"
# Azure's own default when left unset. 240 is the documented maximum for this setting.
AFD_RESPONSE_TIMEOUT_SECONDS="$(jqr '.frontDoor.responseTimeoutSeconds')"; AFD_RESPONSE_TIMEOUT_SECONDS="${AFD_RESPONSE_TIMEOUT_SECONDS:-30}"

# Network isolation (Phase 0 / private endpoints) -- one customer-managed VNet with a dedicated
# AKS-node subnet and a dedicated private-endpoint subnet. All sized with generous defaults so
# most deployments never need to set these.
VNET="$(jqr '.network.vnetName')"; VNET="${VNET:-$AKS-vnet}"
VNET_ADDRESS_SPACE="$(jqr '.network.addressSpace')"; VNET_ADDRESS_SPACE="${VNET_ADDRESS_SPACE:-10.20.0.0/16}"
AKS_SUBNET_PREFIX="$(jqr '.network.aksSubnetPrefix')"; AKS_SUBNET_PREFIX="${AKS_SUBNET_PREFIX:-10.20.1.0/24}"
PE_SUBNET_PREFIX="$(jqr '.network.peSubnetPrefix')"; PE_SUBNET_PREFIX="${PE_SUBNET_PREFIX:-10.20.2.0/24}"

# The one managed identity every app pod (alfred/nexus/riddler/deli/scribe/scriptorium/
# gitrest/historian) authenticates as, via AAD Workload Identity federation to this single
# Kubernetes ServiceAccount. See phase8_workload_identity for what it is and is not used for.
WORKLOAD_IDENTITY="$(jqr '.workloadIdentity.name')"; WORKLOAD_IDENTITY="${WORKLOAD_IDENTITY:-$AKS-workload-identity}"
WORKLOAD_SA_NAMESPACE="default"
WORKLOAD_SA_NAME="fluid-workload-identity"

# Per-service replica counts and (where applicable) HPA min/max bounds -- override via
# microservices.<name>.* in deploy.parameters.json (see deploy.parameters.example.json).
# Defaults below match this repo's own validated starting points; omitting any field/service
# keeps its default. deli/scribe/scriptorium deliberately have no minReplicas/maxReplicas --
# fixed replicas only (autoscaling a Kafka consumer-group deployment forces a full
# partition-assignment rebalance on every scale event, see routerlicious-values.yaml).
# gitrest has no entry at all -- permanently fixed at 1 (ARCHITECTURE.md Section 7.9), not
# configurable here. CPU/memory requests+limits and HPA utilization thresholds are NOT
# customer-configurable, to keep this surface simple -- they stay hardcoded below/in the
# chart values, same as before this section existed.
ALFRED_REPLICAS="$(jqr '.microservices.alfred.replicas')"; ALFRED_REPLICAS="${ALFRED_REPLICAS:-4}"
ALFRED_HPA_MIN="$(jqr '.microservices.alfred.minReplicas')"; ALFRED_HPA_MIN="${ALFRED_HPA_MIN:-4}"
ALFRED_HPA_MAX="$(jqr '.microservices.alfred.maxReplicas')"; ALFRED_HPA_MAX="${ALFRED_HPA_MAX:-500}"

NEXUS_REPLICAS="$(jqr '.microservices.nexus.replicas')"; NEXUS_REPLICAS="${NEXUS_REPLICAS:-4}"
NEXUS_HPA_MIN="$(jqr '.microservices.nexus.minReplicas')"; NEXUS_HPA_MIN="${NEXUS_HPA_MIN:-4}"
NEXUS_HPA_MAX="$(jqr '.microservices.nexus.maxReplicas')"; NEXUS_HPA_MAX="${NEXUS_HPA_MAX:-300}"

RIDDLER_REPLICAS="$(jqr '.microservices.riddler.replicas')"; RIDDLER_REPLICAS="${RIDDLER_REPLICAS:-4}"
RIDDLER_HPA_MIN="$(jqr '.microservices.riddler.minReplicas')"; RIDDLER_HPA_MIN="${RIDDLER_HPA_MIN:-4}"
RIDDLER_HPA_MAX="$(jqr '.microservices.riddler.maxReplicas')"; RIDDLER_HPA_MAX="${RIDDLER_HPA_MAX:-500}"

HISTORIAN_REPLICAS="$(jqr '.microservices.historian.replicas')"; HISTORIAN_REPLICAS="${HISTORIAN_REPLICAS:-4}"
HISTORIAN_HPA_MIN="$(jqr '.microservices.historian.minReplicas')"; HISTORIAN_HPA_MIN="${HISTORIAN_HPA_MIN:-4}"
HISTORIAN_HPA_MAX="$(jqr '.microservices.historian.maxReplicas')"; HISTORIAN_HPA_MAX="${HISTORIAN_HPA_MAX:-500}"

DELI_REPLICAS="$(jqr '.microservices.deli.replicas')"; DELI_REPLICAS="${DELI_REPLICAS:-8}"
SCRIBE_REPLICAS="$(jqr '.microservices.scribe.replicas')"; SCRIBE_REPLICAS="${SCRIBE_REPLICAS:-8}"
SCRIPTORIUM_REPLICAS="$(jqr '.microservices.scriptorium.replicas')"; SCRIPTORIUM_REPLICAS="${SCRIPTORIUM_REPLICAS:-8}"



for required in SUB RG RG_LOC ACR AKS KV COSMOS REDIS STORAGE AFD; do
  if [[ -z "${!required}" ]]; then
    echo "ERROR: '$required' is missing from $PARAMS_FILE" >&2
    exit 1
  fi
done

# This machine's shared kubeconfig current-context has been observed to silently drift to an
# unrelated cluster mid-run (another process on the box merging its own credentials) -- pin
# every kubectl/helm call in the rest of this script to the target cluster explicitly instead
# of trusting ambient current-context, so a drifted context fails loudly rather than silently
# mutating the wrong cluster.
kubectl() { command kubectl --context "$AKS" "$@"; }
helm() { command helm --kube-context "$AKS" "$@"; }

DEPLOY_DIR="${TMPDIR:-/tmp}/selfhost-fluid-$AKS"
mkdir -p "$DEPLOY_DIR"
# Front Door hostnames, discovered in phase12 and consumed by phase5_helm. Persisted so a re-run
# renders the chart values with the real hostnames from the start rather than briefly
# advertising in-cluster names.
AFD_HOSTS_FILE="$DEPLOY_DIR/afd-hosts.env"
LOG_FILE="$DEPLOY_DIR/deploy-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG_FILE") 2>&1
log "Logging to $LOG_FILE"
log "Target: subscription=$SUB resourceGroup=$RG ($RG_LOC) aks=$AKS acr=$ACR"

# ---------------------------------------------------------------------------
# az login / subscription context
# ---------------------------------------------------------------------------
banner "Azure login"
if ! az account show >/dev/null 2>&1; then
  log "No active az session detected — launching az login"
  az login
fi
az account set --subscription "$SUB"
log "Active subscription: $(az account show --query name -o tsv)"

# ---------------------------------------------------------------------------
# FluidFramework checkout (build source). fluidRepoDir is REQUIRED -- this script does not clone
# one. It fetches and checks out the release bundle's pinned commit in that directory, so point it
# at a checkout you are happy to have moved to an arbitrary commit.
#
# The revision is the bundle's resolvedCommitSha, so two deploys of the same bundle build the same
# source. That pinning is also what makes the three chart-template patches in phase5_helm
# (workload identity, nexus terminationGracePeriodSeconds, ignoreCheckpointFlushException) safe:
# each matches upstream text, so an upstream reformat would break the match. Moving to a bundle
# built from a newer revision is what can break them -- they fail loudly rather than deploying
# silently without the setting, but the deploy stops until the anchor is updated.
# ---------------------------------------------------------------------------
if [[ -z "$FLUID_REPO_DIR" ]]; then
  echo "ERROR: fluidRepoDir is not set in $PARAMS_FILE." >&2
  echo "Use a dedicated FluidFramework checkout;" >&2
  echo "deploy.sh will fetch and check out the release's pinned commit ($FLUID_REF) in it." >&2
  echo "  git clone $FLUID_REPO_URL <dir> && set fluidRepoDir to <dir>" >&2
  exit 1
fi
FLUID_ROOT="$FLUID_REPO_DIR"
# Require FLUID_ROOT to own its .git (a checkout root), not just be inside some repo: otherwise
# the checkout --detach below would move an enclosing repo (e.g. this one) off its branch.
if [[ ! -e "$FLUID_ROOT/.git" ]]; then
  echo "ERROR: fluidRepoDir '$FLUID_ROOT' is not the root of a FluidFramework git checkout (no $FLUID_ROOT/.git)." >&2
  echo "Clone it there first: git clone $FLUID_REPO_URL '$FLUID_ROOT'" >&2
  exit 1
fi
log "Using FluidFramework checkout: $FLUID_ROOT"

if [[ "$(git -C "$FLUID_ROOT" rev-parse HEAD 2>/dev/null || true)" != "$FLUID_REF" ]]; then
  # Always resolve the pinned commit from the release's sourceRepo to avoid origin drift.
  if ! git -C "$FLUID_ROOT" cat-file -e "$FLUID_REF^{commit}" >/dev/null 2>&1; then
    git -C "$FLUID_ROOT" fetch --depth 1 "$FLUID_REPO_URL" "$FLUID_REF"
  fi
  git -C "$FLUID_ROOT" checkout --detach "$FLUID_REF"
fi

# ===========================================================================
# Phase 0 — Resource group + ACR
# ===========================================================================
phase0_rg_acr() {
  banner "Phase 0: Resource group + ACR"
  if az group show -n "$RG" >/dev/null 2>&1; then
    log "Resource group $RG already exists, skipping create"
  else
    az group create -n "$RG" -l "$RG_LOC"
  fi
  if az acr show -g "$RG" -n "$ACR" >/dev/null 2>&1; then
    log "ACR $ACR already exists, skipping create"
  else
    # No --zone-redundancy flag needed: ACR zone redundancy is on by default for every tier
    # (Basic/Standard/Premium) in a region with Availability Zone support, and cannot be
    # disabled there -- the flag is legacy/backward-compat only now (aka.ms/acr/az).
    az acr create -g "$RG" -n "$ACR" -l "$RG_LOC" --sku Standard --admin-enabled true
  fi
  [[ "$(az acr show -g "$RG" -n "$ACR" --query provisioningState -o tsv)" == "Succeeded" ]] \
    || { echo "ERROR: ACR $ACR did not provision successfully" >&2; exit 1; }
  log "Phase 0 VERIFY passed"
}

# ===========================================================================
# Phase 0 (network) -- customer-managed VNet: dedicated AKS-node subnet +
# dedicated private-endpoint subnet
# ===========================================================================
# Why a customer-managed VNet: `az aks create` with no --vnet-subnet-id makes AKS create its
# own VNet inside the auto-managed MC_... node resource group. Private Endpoints for Key
# Vault/Cosmos/Redis/Storage need a VNet+subnet to attach to, and AKS nodes/pods need to be in
# that same VNet to resolve the Private DNS Zones -- so the VNet is created explicitly in this
# resource group and passed to `az aks create` via --vnet-subnet-id before the cluster exists
# (that flag only takes effect at cluster/node-pool creation time).
#
# The VNet is created at $AKS_LOC, not $RG_LOC -- `az aks create --vnet-subnet-id` requires the
# VNet and the AKS cluster to be in the same region, and this subscription's AKS node-pool
# capacity may require a different region than RG_LOC. Getting this wrong is a hard failure at
# AKS create time ("vnet ... and the cluster are not in the same region").
phase0_network() {
  banner "Phase 0: Network (VNet + AKS/private-endpoint subnets)"
  if az network vnet show -g "$RG" -n "$VNET" >/dev/null 2>&1; then
    log "VNet $VNET already exists, skipping create"
  else
    az network vnet create -g "$RG" -n "$VNET" -l "$AKS_LOC" --address-prefixes "$VNET_ADDRESS_SPACE" \
      --subnet-name aks-subnet --subnet-prefixes "$AKS_SUBNET_PREFIX"
  fi
  if az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n pe-subnet >/dev/null 2>&1; then
    log "pe-subnet already exists, skipping create"
  else
    # Private Endpoint NICs require network policies (NSG/route-table enforcement) disabled on
    # their subnet -- an Azure requirement for the PE resource type, not optional hardening.
    az network vnet subnet create -g "$RG" --vnet-name "$VNET" -n pe-subnet \
      --address-prefixes "$PE_SUBNET_PREFIX" --disable-private-endpoint-network-policies true
  fi
  AKS_SUBNET_ID="$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n aks-subnet --query id -o tsv)"
  PE_SUBNET_ID="$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n pe-subnet --query id -o tsv)"
  [[ -n "$AKS_SUBNET_ID" && -n "$PE_SUBNET_ID" ]] \
    || { echo "ERROR: could not resolve AKS/private-endpoint subnet IDs" >&2; exit 1; }
  log "Phase 0 (network) VERIFY passed -- aks-subnet=$AKS_SUBNET_ID pe-subnet=$PE_SUBNET_ID"
}

# ===========================================================================
# Phase 0 (network) Task 2 -- allow Azure Front Door to reach the AKS subnet
# ===========================================================================
# Some Azure environments have a policy that auto-attaches a baseline NSG to any new subnet,
# restricting it to the organization's own internal network sources by default -- it has no
# rule for inbound Front Door traffic, so Front Door marks every origin "Unavailable Backends"
# even though the origin answers instantly to a direct request. The policy-attached NSG can
# take several minutes to appear after the subnet is created. This early check avoids waiting
# when policy is fast; phase12_restrict_origin_nsg repeats it after the rest of the deployment.
internet_deny_priority_on_port80() {
  jq -r '
    def covers_port_80:
      if . == "*" or . == "80" then true
      elif test("^[0-9]+-[0-9]+$") then
        (split("-") | ((.[0] | tonumber) <= 80 and (.[1] | tonumber) >= 80))
      else false
      end;
    [.[] |
      select(.direction == "Inbound" and .access == "Deny") |
      select((.protocol == "*") or (((.protocol // "") | ascii_downcase) == "tcp")) |
      select(
        (.sourceAddressPrefix == "Internet") or
        (.sourceAddressPrefix == "AzureFrontDoor.Backend") or
        ((.sourceAddressPrefixes // []) | any(. == "Internet" or . == "AzureFrontDoor.Backend"))
      ) |
      select(
        ((.destinationPortRange // "") | covers_port_80) or
        ((.destinationPortRanges // []) | any(covers_port_80))
      ) |
      .priority
    ] | min // empty
  '
}

ensure_frontdoor_nsg_allow() {
  local nsg_rg="$1" nsg_name="$2"
  local rules blocking_priority existing_priority target_priority priority rule
  rules="$(az network nsg rule list -g "$nsg_rg" --nsg-name "$nsg_name" -o json)"

  # Azure evaluates lower priority numbers first. An organization-managed Internet deny can
  # therefore block the service tag even when an allow rule exists at the old fixed priority.
  blocking_priority="$(jq '[.[] | select(.name != "AllowAzureFrontDoorBackend")]' <<<"$rules" \
    | internet_deny_priority_on_port80)"
  existing_priority="$(jq -r '
    [.[] | select(.name == "AllowAzureFrontDoorBackend") | .priority][0] // empty
  ' <<<"$rules")"

  if [[ -n "$existing_priority" && ( -z "$blocking_priority" || "$existing_priority" -lt "$blocking_priority" ) ]]; then
    target_priority="$existing_priority"
  elif [[ -n "$blocking_priority" ]]; then
    target_priority=""
    for ((priority=blocking_priority - 1; priority >= 100; priority--)); do
      if ! jq -e --argjson priority "$priority" '
        [.[] | select(.name != "AllowAzureFrontDoorBackend" and .priority == $priority)] | length > 0
      ' <<<"$rules" >/dev/null; then
        target_priority="$priority"
        break
      fi
    done
    [[ -n "$target_priority" ]] || {
      echo "ERROR: $nsg_name has no free NSG priority before inbound deny priority $blocking_priority." >&2
      echo "AzureFrontDoor.Backend cannot be allowed safely; update the organization-managed NSG policy." >&2
      return 1
    }
  else
    if [[ -n "$existing_priority" ]]; then
      target_priority="$existing_priority"
    elif ! jq -e '[.[] | select(.priority == 110)] | length > 0' <<<"$rules" >/dev/null; then
      target_priority=110
    else
      target_priority=""
      for ((priority=111; priority <= 4096; priority++)); do
        if ! jq -e --argjson priority "$priority" '
          [.[] | select(.priority == $priority)] | length > 0
        ' <<<"$rules" >/dev/null; then
          target_priority="$priority"
          break
        fi
      done
      [[ -n "$target_priority" ]] || {
        echo "ERROR: $nsg_name has no free NSG priority for AllowAzureFrontDoorBackend." >&2
        return 1
      }
    fi
  fi

  if jq -e --argjson priority "$target_priority" '
    [.[] | select(
      .name == "AllowAzureFrontDoorBackend" and
      .priority == $priority and
      .direction == "Inbound" and
      .access == "Allow" and
      .protocol == "Tcp" and
      .sourceAddressPrefix == "AzureFrontDoor.Backend" and
      .destinationPortRange == "80"
    )] | length == 1
  ' <<<"$rules" >/dev/null; then
    log "AllowAzureFrontDoorBackend is already effective at priority $target_priority on $nsg_name"
  else
    log "Configuring AllowAzureFrontDoorBackend at priority $target_priority on $nsg_name"
    az network nsg rule create -g "$nsg_rg" --nsg-name "$nsg_name" \
      --name AllowAzureFrontDoorBackend --priority "$target_priority" \
      --source-address-prefixes AzureFrontDoor.Backend --destination-port-ranges 80 \
      --access Allow --protocol Tcp --direction Inbound >/dev/null
  fi

  rule="$(az network nsg rule show -g "$nsg_rg" --nsg-name "$nsg_name" \
    -n AllowAzureFrontDoorBackend -o json)"
  jq -e --argjson priority "$target_priority" '
    .priority == $priority and .direction == "Inbound" and .access == "Allow" and
    .protocol == "Tcp" and .sourceAddressPrefix == "AzureFrontDoor.Backend" and
    .destinationPortRange == "80" and .provisioningState == "Succeeded"
  ' <<<"$rule" >/dev/null || {
    echo "ERROR: AllowAzureFrontDoorBackend is not correctly configured on $nsg_name." >&2
    return 1
  }
}

phase0_network_allow_frontdoor() {
  banner "Allow Azure Front Door to reach the AKS subnet"
  local aks_nsg_id aks_nsg_name aks_nsg_rg attempt
  for attempt in 1 2 3 4 5 6; do
    aks_nsg_id="$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n aks-subnet --query networkSecurityGroup.id -o tsv 2>/dev/null)"
    [[ -n "$aks_nsg_id" ]] && break
    log "No NSG attached to aks-subnet yet (attempt $attempt/6), waiting 15s for policy auto-attachment"
    sleep 15
  done
  if [[ -z "$aks_nsg_id" ]]; then
    log "No NSG ever attached to aks-subnet -- nothing to do (this subscription may not have a policy that auto-attaches a baseline NSG)"
    return 0
  fi
  aks_nsg_name="$(basename "$aks_nsg_id")"
  aks_nsg_rg="$(cut -d/ -f5 <<<"$aks_nsg_id")"
  ensure_frontdoor_nsg_allow "$aks_nsg_rg" "$aks_nsg_name"
  log "Front Door subnet NSG VERIFY passed -- $aks_nsg_name allows AzureFrontDoor.Backend on port 80"
}

# Creates a Private Endpoint + Private DNS Zone (idempotent) for one PaaS resource into
# pe-subnet, and links the zone to $VNET so AKS pods resolve the private IP instead of the
# public one. $1=resource id, $2=group id (e.g. vault/MongoDB/redisCache/file/namespace),
# $3=short name (used to build the PE/zone/link names), $4=private DNS zone name.
#
# NOTE: the private endpoint itself is created at $AKS_LOC, NOT $RG_LOC -- same reason as the
# VNet region fix in phase0_network(): `az network private-endpoint create` requires the
# private endpoint to be in the same region as the subnet (pe-subnet) it attaches to. Getting
# this wrong surfaces as a confusing "(InvalidResourceReference)"/"(NotFound) Resource ... not
# found" error for the VNet itself rather than a clear region-mismatch message.
create_private_endpoint() {
  local resource_id="$1" group_id="$2" short_name="$3" zone_name="$4"
  local pe_name="pe-$short_name" zone_link_name="link-$short_name"

  if ! az network private-dns zone show -g "$RG" -n "$zone_name" >/dev/null 2>&1; then
    az network private-dns zone create -g "$RG" -n "$zone_name"
  fi
  if ! az network private-dns link vnet show -g "$RG" -n "$zone_link_name" -z "$zone_name" >/dev/null 2>&1; then
    az network private-dns link vnet create -g "$RG" -n "$zone_link_name" -z "$zone_name" \
      -v "$VNET" -e false
  fi

  if az network private-endpoint show -g "$RG" -n "$pe_name" >/dev/null 2>&1; then
    log "Private endpoint $pe_name already exists, skipping create"
  else
    az network private-endpoint create -g "$RG" -n "$pe_name" -l "$AKS_LOC" \
      --subnet "$PE_SUBNET_ID" --private-connection-resource-id "$resource_id" \
      --group-id "$group_id" --connection-name "${pe_name}-conn"
  fi

  # Same-subscription/tenant private endpoints auto-approve when the requester already has
  # sufficient RBAC on the target resource -- check and surface it rather than assume, since a
  # Pending connection silently leaves the resource unreachable over the private IP.
  local pe_status
  pe_status="$(az network private-endpoint show -g "$RG" -n "$pe_name" \
    --query "privateLinkServiceConnections[0].privateLinkServiceConnectionState.status" -o tsv)"
  [[ "$pe_status" == "Approved" ]] \
    || { echo "ERROR: private endpoint $pe_name connection status is '$pe_status', not Approved" >&2; exit 1; }

  az network private-endpoint dns-zone-group create -g "$RG" --endpoint-name "$pe_name" \
    --name default --private-dns-zone "$zone_name" --zone-name "$short_name" >/dev/null 2>&1 || true
  log "Private endpoint $pe_name -> $zone_name VERIFY passed ($pe_status)"
}

# ===========================================================================
# Phase 1 (images) — import pinned release images into target ACR
# ===========================================================================
phase1_images() {
  banner "Phase 1: Import release images"
  az acr login -n "$ACR"
  local name repository digest src repo ref target_tag target_repo base without_tag

  while IFS=$'\t' read -r name repository digest; do
    [[ -n "$name" && -n "$repository" && -n "$digest" ]] || continue
    src="$repository@$digest"
    repo="${repository#*/}"
    if az acr repository show --name "$ACR" --image "$repo:$IMAGE_TAG" >/dev/null 2>&1; then
      log "$repo:$IMAGE_TAG already in ACR, skipping import"
    else
      az acr import --name "$ACR" --source "$src" --image "$repo:$IMAGE_TAG" --force
    fi
  done < <(jq -r '.builtImages[]? | select(.status == "pinned") | [.name, .repository, .digest] | @tsv' "$IMAGES_FILE")

  while IFS=$'\t' read -r name tag digest; do
    [[ -n "$name" && -n "$digest" ]] || continue

    source_repo="$name"
    target_repo="$name"
    if [[ "$source_repo" == *"/"* ]]; then
      first="${source_repo%%/*}"
      if [[ "$first" == *.* || "$first" == *:* || "$first" == "localhost" ]]; then
        target_repo="${source_repo#*/}"
      else
        source_repo="docker.io/$source_repo"
      fi
    else
      source_repo="docker.io/library/$source_repo"
    fi

    src="$source_repo@$digest"
    target_tag="${tag:-$RELEASE_ID}"

    if az acr repository show --name "$ACR" --image "$target_repo:$target_tag" >/dev/null 2>&1; then
      log "$target_repo:$target_tag already in ACR, skipping import"
    else
      az acr import --name "$ACR" --source "$src" --image "$target_repo:$target_tag" --force
    fi
  done < <(jq -r '.dependencyImages[]? | select(.status == "pinned") | [.name, (.tag // ""), .digest] | @tsv' "$IMAGES_FILE")

  for svc in routerlicious historian gitrest; do
    az acr repository show --name "$ACR" --image "$svc:$IMAGE_TAG" >/dev/null 2>&1 \
      || { echo "ERROR: $svc:$IMAGE_TAG missing from ACR after import" >&2; exit 1; }
  done
  log "Phase 1 VERIFY passed — IMAGE_TAG=$IMAGE_TAG"
}

# ===========================================================================
# Phase 1 (cluster) — AKS create + credentials
# ===========================================================================
phase1_aks() {
  banner "Phase 1: AKS cluster"
  if az aks show -g "$RG" -n "$AKS" >/dev/null 2>&1; then
    log "AKS cluster $AKS already exists, skipping create"
  else
    # --network-plugin azure is required alongside --vnet-subnet-id (a custom VNet needs Azure
    # CNI, not the default plugin selection) -- deploys nodes into the customer-managed
    # aks-subnet from phase0_network instead of an AKS-auto-created VNet in the MC_... group.
    # --enable-oidc-issuer + --enable-workload-identity are the two cluster-level prerequisites
    # for AAD Workload Identity federation (phase8_workload_identity) -- both are create-time-or-
    # update-safe, but setting them at create time avoids an extra round-trip for a new cluster.
    # --zones is omitted entirely when AKS_ZONES is empty (aks.availabilityZones: []) rather
    # than passed as an empty value, which `az` would misparse as missing an argument.
    local aks_zone_args=()
    [[ -n "$AKS_ZONES" ]] && aks_zone_args=(--zones $AKS_ZONES)
    az aks create -g "$RG" -n "$AKS" -l "$AKS_LOC" \
      --kubernetes-version "$AKS_K8S_VERSION" \
      --node-count "$AKS_NODE_COUNT" --node-vm-size "$AKS_NODE_VM_SIZE" --os-sku "$AKS_OS_SKU" \
      --enable-cluster-autoscaler --min-count "$AKS_NODE_MIN_COUNT" --max-count "$AKS_NODE_MAX_COUNT" \
      --network-plugin azure --vnet-subnet-id "$AKS_SUBNET_ID" \
      --enable-oidc-issuer --enable-workload-identity \
      --node-os-upgrade-channel "$AKS_NODE_OS_UPGRADE_CHANNEL" \
      "${aks_zone_args[@]}" \
      --tier "$AKS_TIER" --generate-ssh-keys
  fi
  # Idempotent: safe (and necessary) to run against both a cluster just created above with
  # these flags already set, and a pre-existing cluster from before this script added them --
  # OIDC issuer + Workload Identity CAN be enabled on an existing cluster via `az aks update`
  # (unlike the VNet/subnet, which is create-time-only and cannot be retrofitted).
  if [[ "$(az aks show -g "$RG" -n "$AKS" --query oidcIssuerProfile.enabled -o tsv)" != "true" ]] \
    || [[ "$(az aks show -g "$RG" -n "$AKS" --query securityProfile.workloadIdentity.enabled -o tsv)" != "true" ]]; then
    az aks update -g "$RG" -n "$AKS" --enable-oidc-issuer --enable-workload-identity
  fi
  # Tier CAN be changed on an existing cluster via `az aks update` -- retrofit the same way as
  # the two checks above, so a cluster created before this script requested a tier also gets
  # updated, not just clusters created fresh after this change. `sku.tier` reads back
  # Capitalized (Free/Standard/Premium) regardless of the case AKS_TIER was given in.
  local aks_tier_capitalized
  aks_tier_capitalized="$(awk '{print toupper(substr($0,1,1)) substr($0,2)}' <<<"$AKS_TIER")"
  if [[ "$(az aks show -g "$RG" -n "$AKS" --query sku.tier -o tsv)" != "$aks_tier_capitalized" ]]; then
    az aks update -g "$RG" -n "$AKS" --tier "$AKS_TIER"
  fi
  # Node OS upgrade channel CAN be changed on an existing cluster via `az aks update` --
  # retrofit the same way as tier, so a cluster that predates this setting (or was left on
  # AKS's own NodeImage default) gets corrected to the safe default too, not just clusters
  # created fresh after this change existed.
  if [[ "$(az aks show -g "$RG" -n "$AKS" --query autoUpgradeProfile.nodeOsUpgradeChannel -o tsv)" != "$AKS_NODE_OS_UPGRADE_CHANNEL" ]]; then
    az aks update -g "$RG" -n "$AKS" --node-os-upgrade-channel "$AKS_NODE_OS_UPGRADE_CHANNEL"
  fi
  # Same idempotent retrofit pattern for the system node pool's cluster autoscaler -- unlike
  # VM size/subnet (create-time-only), autoscaler min/max CAN be added to an existing node
  # pool via `az aks nodepool update`. Without this, HPA-driven pod scale-out (phase5_helm's
  # hpa.yaml) has nowhere to schedule new pods once the fixed node count fills up.
  # Compares enabled+min+max together (not just the enabled bool) so a params-file change to
  # an already-autoscaled pool's min/max still gets applied here, instead of being silently
  # skipped because autoscaling was already on.
  local system_pool system_pool_autoscale
  system_pool="$(az aks nodepool list -g "$RG" --cluster-name "$AKS" --query "[?mode=='System'].name | [0]" -o tsv)"
  system_pool_autoscale="$(az aks nodepool show -g "$RG" --cluster-name "$AKS" -n "$system_pool" -o json | jq -r '[.enableAutoScaling, .minCount, .maxCount] | @tsv')"
  if [[ "$system_pool_autoscale" != "$(printf 'true\t%s\t%s' "$AKS_NODE_MIN_COUNT" "$AKS_NODE_MAX_COUNT")" ]]; then
    az aks nodepool update -g "$RG" --cluster-name "$AKS" -n "$system_pool" \
      --enable-cluster-autoscaler --min-count "$AKS_NODE_MIN_COUNT" --max-count "$AKS_NODE_MAX_COUNT"
  fi
  # Zones are create-time-only -- `az aks nodepool update` has no --zones flag, so an existing
  # pool created before this setting (or on a different zone list) can't be retrofitted like
  # tier/channel/autoscaler above. Warn only with the manual migration path, matching
  # phase8_cosmos_throughput's shard-key-mismatch pattern -- deploy.sh should never recreate a
  # node pool on its own (that reschedules every pod on it).
  local system_pool_zones
  system_pool_zones="$(az aks nodepool show -g "$RG" --cluster-name "$AKS" -n "$system_pool" -o json | jq -r '(.availabilityZones // []) | join(" ")')"
  if [[ "$system_pool_zones" != "$AKS_ZONES" ]]; then
    log "WARNING: $system_pool's zones ('$system_pool_zones') do not match aks.availabilityZones ('$AKS_ZONES')."
    log "  Zones can't be changed on an existing pool -- to migrate, add a new zone-spread pool,"
    log "  reschedule workloads onto it, then delete this one:"
    log "    az aks nodepool add -g $RG --cluster-name $AKS -n <new-pool> --zones $AKS_ZONES \\"
    log "      --os-sku $AKS_OS_SKU --node-vm-size $AKS_NODE_VM_SIZE --vnet-subnet-id $AKS_SUBNET_ID \\"
    log "      --enable-cluster-autoscaler --min-count $AKS_NODE_MIN_COUNT --max-count $AKS_NODE_MAX_COUNT"
  fi
  # Always (re-)point kubectl at the target cluster explicitly — never assume the current
  # kubectl context already points here (a stale/unrelated context is a real hazard).
  az aks get-credentials -g "$RG" -n "$AKS" --overwrite-existing
  [[ "$(kubectl get nodes --no-headers | grep -c Ready)" -ge 1 ]] \
    || { echo "ERROR: no Ready nodes in $AKS" >&2; exit 1; }
  AKS_OIDC_ISSUER_URL="$(az aks show -g "$RG" -n "$AKS" --query oidcIssuerProfile.issuerUrl -o tsv)"
  log "Phase 1 VERIFY passed — kubectl now points at $AKS (OIDC issuer: $AKS_OIDC_ISSUER_URL)"
}

# ===========================================================================
# Phase 1 (gitrest node pool) — dedicated node for the one gitrest replica
# ===========================================================================
# The current selfhost design only supports 1 gitrest replica/pod (see azure/backends.yaml's
# gitrest Deployment -- `strategy: Recreate` is a deliberate choice, since concurrent instances
# risk git repository corruption on the shared Azure Files mount), so it can't scale out to
# absorb load with the default solution as-is. Horizontal scaling IS possible, but requires a
# highly customized storage-layer design/implementation (e.g. a per-replica-safe
# IFileSystemManager), not something this reference deployment provides out of the box. The
# next best lever given today's design is isolation: a dedicated node pool so its one pod isn't
# competing for CPU/memory/disk-IO with HPA-scaling Routerlicious replicas
# on the shared system pool (design spec Section 7.9). Fixed at exactly 1 node, no autoscaler --
# gitrest is 1 replica under the current design, so 1 dedicated node is exactly right-sized,
# not an autoscaling range.
GITREST_NODEPOOL="gitrestpool"
phase1_gitrest_nodepool() {
  banner "Phase 1: gitrest dedicated node pool"
  # No node-os-upgrade-channel flag exists on `az aks nodepool add/update` -- it's a
  # cluster-level-only setting (phase1_aks's --node-os-upgrade-channel/retrofit), already
  # covers this pool too, nothing to set here.
  if az aks nodepool show -g "$RG" --cluster-name "$AKS" -n "$GITREST_NODEPOOL" >/dev/null 2>&1; then
    log "Node pool $GITREST_NODEPOOL already exists, skipping create"
  else
    # --zones here just pins the 1 node to one of the list (a single node can't be "spread"),
    # still worth setting so it isn't left on whatever zone AKS defaults to. Omitted entirely
    # when AKS_ZONES is empty, same reasoning as phase1_aks above.
    local aks_zone_args=()
    [[ -n "$AKS_ZONES" ]] && aks_zone_args=(--zones $AKS_ZONES)
    az aks nodepool add -g "$RG" --cluster-name "$AKS" -n "$GITREST_NODEPOOL" \
      --node-count 1 --node-vm-size "$AKS_NODE_VM_SIZE" --os-sku "$AKS_OS_SKU" \
      --vnet-subnet-id "$AKS_SUBNET_ID" "${aks_zone_args[@]}" \
      --node-taints dedicated=gitrest:NoSchedule
  fi
  # `az aks nodepool add` can return before provisioningState actually flips to Succeeded (seen
  # live: it returned while still "Updating", coinciding with a known az CLI/aks-preview bug --
  # "'NoneType' object has no attribute 'split'" -- during the cluster's own AAD role propagation
  # wait moments earlier). Poll instead of checking once immediately.
  local attempt state
  for attempt in $(seq 1 10); do
    state="$(az aks nodepool show -g "$RG" --cluster-name "$AKS" -n "$GITREST_NODEPOOL" --query provisioningState -o tsv)"
    [[ "$state" == "Succeeded" ]] && break
    log "$GITREST_NODEPOOL provisioningState=$state, retrying in 15s (attempt $attempt/10)"
    sleep 15
  done
  [[ "$state" == "Succeeded" ]] \
    || { echo "ERROR: node pool $GITREST_NODEPOOL did not provision successfully (last state: $state)" >&2; exit 1; }
  log "Phase 1 (gitrest node pool) VERIFY passed -- $GITREST_NODEPOOL tainted dedicated=gitrest:NoSchedule, 1 node"
}

# ===========================================================================
# Phase 2 — Image-pull secret (kubelet AcrPull, remove admin secret)
# ===========================================================================
phase2_acr_harden() {
  banner "Phase 2: ACR credential hardening"
  local kubelet_identity acr_id
  kubelet_identity="$(az aks show -g "$RG" -n "$AKS" --query identityProfile.kubeletidentity.objectId -o tsv)"
  acr_id="$(az acr show -n "$ACR" --query id -o tsv)"
  ensure_role_assignment "$kubelet_identity" ServicePrincipal AcrPull "$acr_id"
  kubectl patch serviceaccount default -p '{"imagePullSecrets":null}' || true
  kubectl delete secret regsecret --ignore-not-found
  if [[ "$(az acr show -n "$ACR" --query adminUserEnabled -o tsv)" == "true" ]]; then
    az acr update -n "$ACR" --admin-enabled false
  fi
  [[ "$(az acr show -n "$ACR" --query adminUserEnabled -o tsv)" == "false" ]] \
    || { echo "ERROR: ACR admin account still enabled" >&2; exit 1; }
  log "Phase 2 VERIFY passed"
}

# ===========================================================================
# Phase 8 Task 0 — the one workload identity (AAD Workload Identity)
# Creates exactly ONE user-assigned managed identity, federated to ONE Kubernetes
# ServiceAccount used by all 8 app workloads (alfred, nexus, riddler, deli, scribe,
# scriptorium, gitrest, historian) to reach Key Vault (phase8_keyvault). Event Hubs is reached
# with a shared-access-key connection string from that same vault, not with this identity -- see
# phase3_eventhubs for why the managed-identity path is not usable on stock images.
#
# ACR image pulls (phase2_acr_harden) and the Azure Files CSI driver's storage-key retrieval
# (phase8_storage) stay on the AKS kubelet/cluster identities instead -- those are
# Azure-managed system-component operations with no supported way to rebind onto a
# customer-created identity.
phase8_workload_identity() {
  banner "Phase 8: Workload identity (Key Vault access)"
  if az identity show -g "$RG" -n "$WORKLOAD_IDENTITY" >/dev/null 2>&1; then
    log "Managed identity $WORKLOAD_IDENTITY already exists, skipping create"
  else
    az identity create -g "$RG" -n "$WORKLOAD_IDENTITY" -l "$RG_LOC"
  fi
  WORKLOAD_IDENTITY_CLIENT_ID="$(az identity show -g "$RG" -n "$WORKLOAD_IDENTITY" --query clientId -o tsv)"
  WORKLOAD_IDENTITY_OBJECT_ID="$(az identity show -g "$RG" -n "$WORKLOAD_IDENTITY" --query principalId -o tsv)"

  # api://AzureADTokenExchange is the fixed audience AKS's Workload Identity webhook requests
  # tokens for -- a constant, not a per-deployment value.
  if az identity federated-credential show -g "$RG" --identity-name "$WORKLOAD_IDENTITY" \
      -n "$WORKLOAD_SA_NAME" >/dev/null 2>&1; then
    log "Federated credential $WORKLOAD_SA_NAME already exists, skipping create"
  else
    az identity federated-credential create -g "$RG" --identity-name "$WORKLOAD_IDENTITY" \
      -n "$WORKLOAD_SA_NAME" --issuer "$AKS_OIDC_ISSUER_URL" \
      --subject "system:serviceaccount:$WORKLOAD_SA_NAMESPACE:$WORKLOAD_SA_NAME" \
      --audiences api://AzureADTokenExchange
  fi
  [[ -n "$WORKLOAD_IDENTITY_CLIENT_ID" && -n "$WORKLOAD_IDENTITY_OBJECT_ID" ]] \
    || { echo "ERROR: could not resolve workload identity client/object id" >&2; exit 1; }
  log "Phase 8 (workload identity) VERIFY passed — WORKLOAD_IDENTITY_CLIENT_ID=$WORKLOAD_IDENTITY_CLIENT_ID"
}

# ===========================================================================
# Phase 8 Task 1 — Key Vault + Secrets Store CSI driver add-on
# ===========================================================================
phase8_keyvault() {
  banner "Phase 8: Key Vault + Secrets Store CSI driver"
  if az keyvault show -g "$RG" -n "$KV" >/dev/null 2>&1; then
    log "Key Vault $KV already exists, skipping create"
  else
    az keyvault create -g "$RG" -n "$KV" -l "$RG_LOC" --enable-rbac-authorization true
  fi
  if [[ "$(az aks show -g "$RG" -n "$AKS" --query 'addonProfiles.azureKeyvaultSecretsProvider.enabled' -o tsv 2>/dev/null)" == "true" ]]; then
    log "Secrets Store CSI driver add-on already enabled, skipping"
  else
    aks_enable_addon_with_retry "$RG" "$AKS" azure-keyvault-secrets-provider
  fi
  # The CSI add-on always auto-creates its OWN system-managed identity too -- left alone and
  # granted nothing. secretproviderclass.yaml uses Workload Identity mode instead, so every pod
  # fetches secrets via the ONE workload identity above, not this add-on's identity.
  CSI_IDENTITY_CLIENT_ID="$(az aks show -g "$RG" -n "$AKS" --query 'addonProfiles.azureKeyvaultSecretsProvider.identity.clientId' -o tsv)"
  local kv_id caller_object_id
  kv_id="$(az keyvault show -g "$RG" -n "$KV" --query id -o tsv)"
  ensure_role_assignment "$WORKLOAD_IDENTITY_OBJECT_ID" ServicePrincipal "Key Vault Secrets User" "$kv_id"
  # RBAC-mode Key Vaults grant the creator no data-plane access by default -- this script
  # writes secrets below, so also grant the signed-in caller write access. Assumes an
  # interactive `az login` user, not a service-principal-based CI run.
  caller_object_id="$(current_principal_object_id)"
  ensure_role_assignment "$caller_object_id" User "Key Vault Secrets Officer" "$kv_id"
  [[ -n "$LAST_CREATED_ROLE_ID" ]] && TEMP_ROLE_ASSIGNMENT_IDS+=("$LAST_CREATED_ROLE_ID")
  AZURE_TENANT_ID="$(az account show --query tenantId -o tsv)"
  [[ "$(az keyvault show -g "$RG" -n "$KV" --query properties.provisioningState -o tsv)" == "Succeeded" ]] \
    || { echo "ERROR: Key Vault $KV did not provision successfully" >&2; exit 1; }

  # The final desired state is private-only. Remember it before opening the data plane so an
  # interrupted deployment still locks the vault through the EXIT trap.
  KV_PUBLIC_ACCESS_RESTORE="Disabled"

  # Secret writes below are data-plane calls from the signed-in operator's workstation. Keep
  # public access available until those writes finish, then phase8_keyvault_lockdown disables it.
  # On a re-run against an already-locked vault, re-enable it here so the same Azure user path
  # continues to work without requiring VNet, VPN, or jump-host connectivity.
  if [[ "$(az keyvault show -g "$RG" -n "$KV" --query properties.publicNetworkAccess -o tsv)" != "Enabled" ]]; then
    az keyvault update -g "$RG" -n "$KV" --public-network-access Enabled
  fi
  create_private_endpoint "$kv_id" vault "$KV" privatelink.vaultcore.azure.net

  log "Phase 8 (Key Vault) VERIFY passed — workload identity has Key Vault Secrets User; CSI add-on identity (clientId=$CSI_IDENTITY_CLIENT_ID) is unused by design"
}

# ===========================================================================
# Phase 8 Task 1b — Key Vault network lockdown (run LAST, after every secret write)
# ===========================================================================
phase8_keyvault_lockdown() {
  banner "Phase 8: Key Vault network lockdown"
  if [[ "$(az keyvault show -g "$RG" -n "$KV" --query properties.publicNetworkAccess -o tsv)" != "Disabled" ]]; then
    az keyvault update -g "$RG" -n "$KV" --public-network-access Disabled
  fi
  [[ "$(az keyvault show -g "$RG" -n "$KV" --query properties.publicNetworkAccess -o tsv)" == "Disabled" ]] \
    || { echo "ERROR: Key Vault $KV public network access is still enabled" >&2; exit 1; }
  KV_PUBLIC_ACCESS_RESTORE=""
  log "Phase 8 (Key Vault lockdown) VERIFY passed — only the private endpoint (AKS VNet) can reach $KV now"
}

# ===========================================================================
# Phase 8 Task 2 — Cosmos DB for MongoDB (standard/RU-based API)
# ===========================================================================
# Azure has two "Cosmos DB for MongoDB" products: the newer vCore option (a separate VM-based
# model), and the original GA, RU-based "API for MongoDB" deployed here. vCore's preview
# control plane returned a persistent internal_server_error for this subscription, so this
# repo uses the RU-based API instead -- Routerlicious's mongodb.operationsDbEndpoint consumes
# either identically (just a MongoDB wire-protocol connection string).
phase8_cosmos() {
  banner "Phase 8: Cosmos DB for MongoDB (standard API)"
  # A Failed-state account still returns from `show` (the ARM resource shell persists), so
  # without this check it would fall into the "already exists, skipping create" branch below
  # forever. Confirmed live: a zone-redundant capacity ServiceUnavailable left the account in
  # this state, and Azure then rejects even a non-zone-redundant retry against the same name
  # with "previous attempt to create it was not successful. Please delete the previous
  # instance". Delete it here so the create path gets a clean retry instead of repeating the
  # same dead end on every re-run.
  if [[ "$(az cosmosdb show -n "$COSMOS" -g "$RG" --query provisioningState -o tsv 2>/dev/null)" == "Failed" ]]; then
    log "Cosmos DB account $COSMOS is in a Failed provisioning state, deleting before retry"
    az cosmosdb delete -n "$COSMOS" -g "$RG" --yes
  fi
  if az cosmosdb show -n "$COSMOS" -g "$RG" >/dev/null 2>&1; then
    log "Cosmos DB account $COSMOS already exists, skipping create"
    # isZoneRedundant is set per-region and can only be changed by adding a NEW region --
    # `az cosmosdb update --locations` adds a region, it does not modify an existing one's
    # isZoneRedundant. Warn only, matching the same pattern as AKS zones/Storage SKU below --
    # deploy.sh should never restructure an account's region topology on its own.
    local current_zone_redundant
    current_zone_redundant="$(az cosmosdb show -n "$COSMOS" -g "$RG" --query "locations[0].isZoneRedundant" -o tsv)"
    if [[ "$(tr '[:upper:]' '[:lower:]' <<<"$current_zone_redundant")" != "$(tr '[:upper:]' '[:lower:]' <<<"$COSMOS_ZONE_REDUNDANT")" ]]; then
      log "WARNING: $COSMOS's region isZoneRedundant ('$current_zone_redundant') does not match cosmos.zoneRedundant ('$COSMOS_ZONE_REDUNDANT'). Can't be changed on an existing region -- the only path is adding a new zone-redundant region (az cosmosdb update -n $COSMOS -g $RG --locations regionName=<new-region> failoverPriority=1 isZoneRedundant=$COSMOS_ZONE_REDUNDANT), waiting for it to sync, then removing this region once failed over."
    fi
  else
    # --capabilities EnableMongo is required, not cosmetic: some Azure Policy configurations
    # (baseline security policies restricting local/key-based auth) deny any Cosmos account
    # with local auth enabled unless its capabilities list explicitly declares EnableMongo.
    # --kind MongoDB alone doesn't do that.
    # isZoneRedundant requires a region with Availability Zone support -- preflight-check.sh
    # validates this ahead of time and fails there if unsupported, so a create failure here
    # means that check was skipped or the region's support changed since. Fail loudly rather
    # than silently downgrading to non-zone-redundant behind the customer's back: the customer
    # sets cosmos.zoneRedundant to False themselves if their region can't support it.
    if ! az cosmosdb create -n "$COSMOS" -g "$RG" --kind MongoDB --capabilities EnableMongo \
      --server-version "$COSMOS_SERVER_VERSION" \
      --locations regionName="$RG_LOC" failoverPriority=0 isZoneRedundant="$COSMOS_ZONE_REDUNDANT" \
      2>/tmp/cosmos_create_err.$$; then
      cat /tmp/cosmos_create_err.$$ >&2
      rm -f /tmp/cosmos_create_err.$$
      echo "ERROR: Cosmos DB create with isZoneRedundant=$COSMOS_ZONE_REDUNDANT failed -- if $RG_LOC doesn't support Availability Zones, set cosmos.zoneRedundant to False in your parameters file (re-run azure/preflight-check.sh to confirm) and retry" >&2
      exit 1
    fi
    rm -f /tmp/cosmos_create_err.$$
  fi
  local cosmos_conn cosmos_id
  cosmos_conn="$(az cosmosdb keys list -n "$COSMOS" -g "$RG" --type connection-strings \
    --query "connectionStrings[0].connectionString" -o tsv)"
  keyvault_secret_set_with_retry "$KV" cosmos-connection-string "$cosmos_conn"
  unset cosmos_conn
  [[ "$(az cosmosdb show -n "$COSMOS" -g "$RG" --query provisioningState -o tsv)" == "Succeeded" ]] \
    || { echo "ERROR: Cosmos DB account $COSMOS did not provision successfully" >&2; exit 1; }
  az keyvault secret show --vault-name "$KV" --name cosmos-connection-string --query id -o tsv >/dev/null

  # `az cosmosdb keys list`/`show`/`update` are all ARM control-plane calls, not direct calls to
  # the account's own MongoDB wire-protocol endpoint -- safe to disable public network access
  # immediately, unlike Key Vault (see phase8_keyvault_lockdown).
  cosmos_id="$(az cosmosdb show -n "$COSMOS" -g "$RG" --query id -o tsv)"
  if [[ "$(az cosmosdb show -n "$COSMOS" -g "$RG" --query publicNetworkAccess -o tsv)" != "Disabled" ]]; then
    az cosmosdb update -n "$COSMOS" -g "$RG" --public-network-access Disabled
  fi
  create_private_endpoint "$cosmos_id" MongoDB "$COSMOS" privatelink.mongo.cosmos.azure.com

  if [[ "$(az cosmosdb show -n "$COSMOS" -g "$RG" --query capacityMode -o tsv)" == "Provisioned" ]]; then
    phase8_cosmos_throughput
  fi

  log "Phase 8 (Cosmos DB) VERIFY passed — public network access disabled, only the private endpoint (AKS VNet) can reach $COSMOS"
}

# ===========================================================================
# Phase 8 Task 3 — per-collection Cosmos DB throughput
# ===========================================================================
# The chart's fluid-configmap.yaml declares 8 Mongo collection names; only 7 are actually read
# anywhere in the current code (confirmed across all 6 top-level services):
#   deltas       - scriptorium, every sequenced op. Highest-frequency collection by far.
#   documents    - alfred/scribe/deli, but the real call site (DeliLambdaFactory.create ->
#                  documentRepository.readOne) fires once per document-lambda lifecycle
#                  (session/document open), not once per op.
#   checkpoints  - scribe/deli/nexus/scriptorium's soft-delete path, one collection shared via
#                  a "type" discriminator, written on each lambda's periodic checkpoint.
#   scribeDeltas - scribe's own copy of the sequenced-op stream, used for summarization.
#   tenants      - riddler (MongoTenantRepository).
#   nodes/reservations - nexus only: NodeManager/ReservationManager, imported from
#                  @fluidframework/server-memory-orderer (a different package than
#                  services-core, easy to miss) and unconditionally wired into nexus's
#                  OrdererManager on every startup.
# partitions is the only one of the 8 not read anywhere and intentionally not created.
#
# All 7 are autoscale, not just the highest-frequency ones: manual throughput is a hard cap
# (429 throttling, no headroom), and documents/tenants/nodes/reservations have a real burst
# risk (mass client reconnects, or many pods restarting after a rolling deploy/HPA event) even
# though their average load is low. Azure's autoscale floor bills the same as a manual 400
# RU/s, so there's no average-case cost penalty, only burst protection.
#
# RU/s values are a starting point informed by a real reference deployment plus source-verified
# usage patterns, not load-test-derived final values (design doc Section 9 "pending load test").
phase8_cosmos_throughput() {
  local coll max shard
  # $1=name $2=max RU/s (autoscale) $3=shard key
  # documents/checkpoints/scribeDeltas sharded on documentId: matches deltas' existing sharding,
  # and lets documents scale past the ~10000 RU/s ceiling an unsharded ("fixed to unlimited
  # migration") collection is stuck at -- confirmed
  # live that documents alone hit 100% RU utilization for 25+ minutes under real traffic while
  # sharded deltas stayed at ~30% of its own much higher ceiling. Adding a shard key to an
  # EXISTING collection is not an in-place operation (Cosmos has no "add shard key" API), so
  # this script never does that automatically -- if one of these is unsharded, it just warns
  # with the exact manual command, the same as the pre-existing "legacy fixed container" case
  # below. Only a genuinely new collection (doesn't exist yet) gets created with the shard key
  # directly, in the "else" branch.
  #
  # tenants sharded on _id (separate design decision): confirmed via source
  # (tenantManager.ts's createTenant() -> tenantRepository.insertOne({ _id: tenantId, ... })
  # -- _id is always explicitly set to the tenant's own unique tenantId on insert. Unlike
  # deltas/documents/checkpoints/scribeDeltas, tenants has no documentId-equivalent field, so
  # _id (guaranteed present/unique on every Mongo document) is the natural shard key here. Same
  # never-auto-delete rule applies -- confirmed live the collection was unsharded when this was
  # added, so it only gets the warning path below until manually migrated.
  for entry in "deltas $COSMOS_RU_DELTAS documentId" "documents $COSMOS_RU_DOCUMENTS documentId" \
    "checkpoints $COSMOS_RU_CHECKPOINTS documentId" "scribeDeltas $COSMOS_RU_SCRIBE_DELTAS documentId" \
    "tenants $COSMOS_RU_TENANTS _id" "nodes $COSMOS_RU_NODES" "reservations $COSMOS_RU_RESERVATIONS"; do
    read -r coll max shard <<<"$entry"
    if az cosmosdb mongodb collection throughput show -a "$COSMOS" -g "$RG" -d admin -n "$coll" >/dev/null 2>&1; then
      if [[ -n "$shard" ]] && ! az cosmosdb mongodb collection show -a "$COSMOS" -g "$RG" -d admin -n "$coll" \
          --query "resource.shardKey.$shard" -o tsv 2>/dev/null | grep -q .; then
        log "WARNING: $coll needs shard key '$shard' but is unsharded -- fixing requires manually dropping and recreating it (az cosmosdb mongodb collection delete -a $COSMOS -g $RG -d admin -n $coll --yes, then create -a $COSMOS -g $RG -d admin -n $coll --shard $shard --max-throughput $max); not done automatically since it discards existing data"
        continue
      fi
      # Manual collections can't go straight to autoscale via a plain `throughput update` --
      # Cosmos requires an explicit migrate step first. Only migrate if it's actually manual
      # right now (has a plain `throughput` value, no `autoscaleSettings`).
      if [[ -z "$(az cosmosdb mongodb collection throughput show -a "$COSMOS" -g "$RG" -d admin -n "$coll" --query resource.autoscaleSettings.maxThroughput -o tsv 2>/dev/null)" ]]; then
        az cosmosdb mongodb collection throughput migrate -a "$COSMOS" -g "$RG" -d admin -n "$coll" --throughput-type autoscale -o none
      fi
      if ! az cosmosdb mongodb collection throughput update -a "$COSMOS" -g "$RG" -d admin -n "$coll" --max-throughput "$max" -o none 2>/tmp/cosmos_thr_err.$$; then
        if grep -q "fixed to unlimited" /tmp/cosmos_thr_err.$$; then
          log "WARNING: $coll is a legacy 'fixed' container (capped, no autoscale) -- fixing requires manually dropping and recreating it (az cosmosdb mongodb collection delete, then create --shard $shard --max-throughput $max); not done automatically since it discards existing data"
        else
          cat /tmp/cosmos_thr_err.$$ >&2
        fi
      fi
    else
      if [[ -n "$shard" ]]; then
        az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n "$coll" --shard "$shard" --max-throughput "$max" -o none
      else
        az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n "$coll" --max-throughput "$max" -o none
      fi
    fi
  done
  rm -f /tmp/cosmos_thr_err.$$
  # Clean up the one genuinely unused collection (partitions) if a prior run created it.
  if az cosmosdb mongodb collection show -a "$COSMOS" -g "$RG" -d admin -n partitions >/dev/null 2>&1; then
    az cosmosdb mongodb collection delete -a "$COSMOS" -g "$RG" -d admin -n partitions --yes
    log "Deleted unused collection partitions (not read by any current Routerlicious code path)"
  fi
  log "Phase 8 (Cosmos DB throughput) VERIFY passed -- 7 collections in use, all autoscale"
}


# ===========================================================================
# Phase 8 Task 4 — Azure Managed Redis
# ===========================================================================
phase8_redis() {
  banner "Phase 8: Azure Cache for Redis"
  # What's deployed here is the classic/GA "Azure Cache for Redis" service, NOT the newer
  # Enterprise-tier "Azure Managed Redis" -- the latter hit AllocationFailed (insufficient
  # capacity) across every region tried for this subscription.
  #
  # Auth is password/access-key via Key Vault, not Entra ID: the Fluid server's Redis client
  # (RedisClientConnectionManager, shared by Routerlicious and gitrest) is 100% password-based
  # with no Entra ID/managed-identity code path.
  #
  # Check provisioningState, not just existence -- a cache stuck in a non-Succeeded state still
  # answers `show` successfully, which would otherwise look like a healthy resource to skip.
  local existing_state
  existing_state="$(az redis show -n "$REDIS" -g "$RG" --query provisioningState -o tsv 2>/dev/null || true)"
  if [[ "$existing_state" == "Succeeded" ]]; then
    log "Redis cache $REDIS already exists and provisioned successfully, skipping create"
  else
    if [[ -n "$existing_state" ]]; then
      log "Redis cache $REDIS exists in non-Succeeded state '$existing_state' -- deleting and recreating"
      az redis delete -n "$REDIS" -g "$RG" --yes
    fi
    # Try the real HA profile first (3 replicas, zone-redundant); both replicasPerPrimary and
    # zones are CREATE-TIME-ONLY -- neither can be retrofitted onto an existing cache. Falls
    # back to a plain single-instance cache if the region/subscription can't satisfy them.
    # --zones is omitted entirely when REDIS_ZONES is empty (redis.zones: []), same reasoning
    # as phase1_aks -- passing it as an empty value would make `az` misparse the next flag.
    local redis_zone_args=()
    [[ -n "$REDIS_ZONES" ]] && redis_zone_args=(--zones $REDIS_ZONES)
    if ! az redis create -n "$REDIS" -g "$RG" -l "$REDIS_LOC" --sku "$REDIS_SKU" --vm-size "$REDIS_VM_SIZE" \
      --redis-version "$REDIS_VERSION" \
      --replicas-per-master "$REDIS_REPLICAS_PER_MASTER" "${redis_zone_args[@]}" \
      --minimum-tls-version 1.2 2>/tmp/redis_create_err.$$; then
      log "WARNING: Redis create with $REDIS_REPLICAS_PER_MASTER replicas/zones ($REDIS_ZONES) failed -- falling back to a single-instance, non-zonal cache"
      cat /tmp/redis_create_err.$$ >&2
      az redis create -n "$REDIS" -g "$RG" -l "$REDIS_LOC" --sku "$REDIS_SKU" --vm-size "$REDIS_VM_SIZE" \
        --redis-version "$REDIS_VERSION" \
        --minimum-tls-version 1.2
    fi
    rm -f /tmp/redis_create_err.$$
  fi
  [[ "$(az redis show -n "$REDIS" -g "$RG" --query provisioningState -o tsv)" == "Succeeded" ]] \
    || { echo "ERROR: Redis cache $REDIS did not provision successfully" >&2; exit 1; }
  REDIS_HOSTNAME="$(az redis show -n "$REDIS" -g "$RG" --query hostName -o tsv)"
  local redis_key redis_id
  redis_key="$(az redis list-keys -n "$REDIS" -g "$RG" --query primaryKey -o tsv)"
  # ALL 8 app workloads get the Redis password the same way: Key Vault + CSI mount via the one
  # workload identity (see phase4_secrets_infra / phase5_helm). No plain Kubernetes Secret is
  # created for it anywhere.
  keyvault_secret_set_with_retry "$KV" redis-password "$redis_key"
  az keyvault secret show --vault-name "$KV" --name redis-password --query id -o tsv >/dev/null

  # ARM control-plane calls only -- safe to disable public network access immediately, unlike
  # Key Vault. Use the Redis-specific `az redis update --set`, not the generic `az resource
  # update --set properties.X`, which fails on a zonal cache with an invalid merge-patch error
  # against the zones/zonal-configuration structure.
  redis_id="$(az redis show -n "$REDIS" -g "$RG" --query id -o tsv)"
  if [[ "$(az redis show -n "$REDIS" -g "$RG" --query publicNetworkAccess -o tsv)" != "Disabled" ]]; then
    az redis update -n "$REDIS" -g "$RG" --set publicNetworkAccess=Disabled >/dev/null
  fi
  create_private_endpoint "$redis_id" redisCache "$REDIS" privatelink.redis.cache.windows.net
  unset redis_key
  log "Phase 8 (Azure Cache for Redis) VERIFY passed — public network access disabled, only the private endpoint (AKS VNet) can reach $REDIS"
}

# ===========================================================================
# Phase 8 Task 5 — gitrest Storage Account (managed-identity key retrieval,
# matching the current azure/backends.yaml end-state — no static K8s Secret)
# ===========================================================================
phase8_storage() {
  banner "Phase 8: gitrest Storage Account"
  if az storage account show -g "$RG" -n "$STORAGE" >/dev/null 2>&1; then
    log "Storage account $STORAGE already exists, skipping create"
    # Older accounts created before this fix may still default to allowSharedKeyAccess=false
    # -- reconcile it explicitly since deploy.sh is meant to be safely re-run.
    if [[ "$(az storage account show -g "$RG" -n "$STORAGE" --query allowSharedKeyAccess -o tsv)" != "true" ]]; then
      log "Enabling shared key access on $STORAGE (required for the Azure Files CSI driver's SMB mount)"
      az storage account update -g "$RG" -n "$STORAGE" --allow-shared-key-access true >/dev/null
    fi
    # SKU (e.g. LRS -> ZRS) cannot be changed on an existing account -- confirmed via `az
    # storage account update --help`. Warn only, matching the same pattern as AKS zones/Cosmos
    # zone redundancy above -- deploy.sh never recreates a storage account on its own (that
    # would orphan gitrest's existing repos on the old account).
    local current_storage_sku
    current_storage_sku="$(az storage account show -g "$RG" -n "$STORAGE" --query sku.name -o tsv)"
    if [[ "$current_storage_sku" != "$STORAGE_SKU" ]]; then
      log "WARNING: $STORAGE's SKU ('$current_storage_sku') does not match storage.sku ('$STORAGE_SKU'). Can't be changed on an existing account -- migrating means creating a new account, copying data across (e.g. azcopy), and repointing gitrest's PVC/StorageClass at it."
    fi
  else
    # --allow-shared-key-access true is required: newer Azure Storage accounts default to
    # disabling shared-key auth entirely, but the Azure Files CSI driver mounts shares via
    # CIFS using the account key fetched through the kubelet identity's role grant below --
    # with shared-key access disabled, that mount fails with a CIFS-level "Permission denied",
    # not an ARM/RBAC error.
    # STORAGE_SKU (Standard_ZRS by default) is not available in every region -- fall back to
    # Standard_LRS on failure the same way phase8_redis/phase8_cosmos fall back.
    if ! az storage account create -g "$RG" -n "$STORAGE" -l "$RG_LOC" --sku "$STORAGE_SKU" --kind StorageV2 \
      --allow-shared-key-access true 2>/tmp/storage_create_err.$$; then
      log "WARNING: Storage account create with SKU $STORAGE_SKU failed -- falling back to Standard_LRS (not zone-redundant)"
      cat /tmp/storage_create_err.$$ >&2
      az storage account create -g "$RG" -n "$STORAGE" -l "$RG_LOC" --sku Standard_LRS --kind StorageV2 \
        --allow-shared-key-access true
    fi
    rm -f /tmp/storage_create_err.$$
    # azure/backends.yaml's PVC does NOT bind to this named share -- the azurefile-gitrest
    # StorageClass dynamically provisions its own separate share instead. This "gitrest-data"
    # share exists for parity/documentation only; its quota is unused.
    az storage share-rm create -g "$RG" --storage-account "$STORAGE" --name gitrest-data --quota 16
  fi
  # azure/backends.yaml's StorageClass has no secretName/secretNamespace -- the Azure File CSI
  # driver fetches the storage key via ARM at mount time using the AKS kubelet identity.
  #
  # allowSharedKeyAccess stays true, not folded into the "disable all shared keys" hardening
  # pass -- the Azure Files CSI driver's SMB/CIFS mount has no supported Entra-ID-only path,
  # and disabling shared key access breaks the mount with a CIFS error, not an ARM error. The
  # key itself is still never a static Kubernetes Secret; network access is locked down below.
  # A full fix would mean migrating gitrest's PV from Azure Files SMB to NFS (no account-key
  # auth, but Premium-tier-only and a protocol change) -- a bigger, separate decision.
  local kubelet_identity storage_id
  kubelet_identity="$(az aks show -g "$RG" -n "$AKS" --query identityProfile.kubeletidentity.objectId -o tsv)"
  storage_id="$(az storage account show -g "$RG" -n "$STORAGE" --query id -o tsv)"
  ensure_role_assignment "$kubelet_identity" ServicePrincipal "Storage Account Key Operator Service Role" "$storage_id"

  # ARM control-plane calls only (the "-rm" share command avoids needing a data-plane storage
  # key) -- safe to disable public network access immediately, unlike Key Vault. The actual
  # SMB mount happens from AKS pods, inside the VNet, once the private endpoint is live.
  if [[ "$(az storage account show -g "$RG" -n "$STORAGE" --query publicNetworkAccess -o tsv)" != "Disabled" ]]; then
    az storage account update -g "$RG" -n "$STORAGE" --public-network-access Disabled
  fi
  create_private_endpoint "$storage_id" file "$STORAGE" privatelink.file.core.windows.net
  # The Azure File CSI driver's PROVISIONING path (dynamic PVC -> file share create/read via
  # ARM) runs under the AKS cluster's own control-plane identity, a DIFFERENT identity from the
  # kubelet identity granted above. AKS's auto-grant for this role only covers storage accounts
  # inside the auto-created node RG, not a bring-your-own account in the customer's own RG like
  # this one, so it must be granted explicitly here.
  local cluster_identity
  cluster_identity="$(az aks show -g "$RG" -n "$AKS" --query identity.principalId -o tsv)"
  ensure_role_assignment "$cluster_identity" ServicePrincipal "Storage Account Contributor" "$storage_id"
  [[ "$(az storage account show -g "$RG" -n "$STORAGE" --query provisioningState -o tsv)" == "Succeeded" ]] \
    || { echo "ERROR: Storage account $STORAGE did not provision successfully" >&2; exit 1; }
  log "Phase 8 (Storage Account) VERIFY passed"
}

# ===========================================================================
# Phase 3 — Azure Event Hubs (Kafka protocol) as the ordering backend
# ===========================================================================
# Namespace shape follows the production baseline (Standard tier, kafkaEnabled, TLS 1.2 minimum,
# zone-redundant) with one deliberate deviation: the hardened posture is
# disableLocalAuth=true with managed-identity auth, which the rdkafka client reaches via
# `oauthBearerConfig.tokenProvider` -- a JS *function*, so it cannot come from config and would
# require a custom routerlicious image. This deployment uses stock upstream images, so it takes
# the `eventHubConnString` path instead (SASL_SSL/PLAIN, see rdkafkaBase.ts), which needs local
# auth left enabled. The connection string is Key-Vault-stored and CSI-mounted, never in a file.
phase3_eventhubs() {
  banner "Phase 3: Azure Event Hubs (Kafka backend)"
  [[ -n "$EVENTHUBS_NAMESPACE" ]] \
    || { echo "ERROR: kafka.eventHubs.namespaceName is unset in $PARAMS_FILE" >&2; exit 1; }

  if az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" >/dev/null 2>&1; then
    log "Event Hubs namespace $EVENTHUBS_NAMESPACE already exists, skipping create"
    # Zone redundancy is fixed at create time, so an existing namespace cannot be brought into
    # line by re-running -- warn rather than fail, same as the Cosmos region check.
    local current_zr
    current_zr="$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query zoneRedundant -o tsv 2>/dev/null)"
    [[ "$current_zr" == "$EVENTHUBS_ZONE_REDUNDANT" ]] \
      || log "WARNING: $EVENTHUBS_NAMESPACE has zoneRedundant='$current_zr' but kafka.eventHubs.zoneRedundant is '$EVENTHUBS_ZONE_REDUNDANT' -- create-time only, needs a new namespace to change"
  else
    az eventhubs namespace create -g "$RG" -n "$EVENTHUBS_NAMESPACE" -l "$RG_LOC" \
      --sku "$EVENTHUBS_SKU" --capacity "$EVENTHUBS_CAPACITY" \
      --enable-kafka true --zone-redundant "$EVENTHUBS_ZONE_REDUNDANT" \
      --enable-auto-inflate "$EVENTHUBS_AUTO_INFLATE" --maximum-throughput-units "$EVENTHUBS_MAX_TU" \
      --minimum-tls-version 1.2 \
      --tags "Az.Sec.DisableLocalAuth.EventHub::Skip=true" \
      || { echo "ERROR: Event Hubs namespace create failed. If $RG_LOC has no Availability Zone support, set kafka.eventHubs.zoneRedundant to false in $PARAMS_FILE and re-run." >&2; exit 1; }
  fi

  # Kafka on Event Hubs requires the Standard tier or above -- Basic has no Kafka endpoint, and
  # the failure would otherwise surface much later as an opaque client connection error.
  local tier
  tier="$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query sku.tier -o tsv 2>/dev/null)"
  [[ "$tier" != "Basic" ]] \
    || { echo "ERROR: Event Hubs namespace $EVENTHUBS_NAMESPACE is Basic tier, which has no Kafka endpoint. Set kafka.eventHubs.sku to Standard or higher." >&2; exit 1; }

  for hub in rawdeltas deltas; do
    if az eventhubs eventhub show -g "$RG" --namespace-name "$EVENTHUBS_NAMESPACE" -n "$hub" >/dev/null 2>&1; then
      log "Event hub $hub already exists, skipping create"
    else
      az eventhubs eventhub create -g "$RG" --namespace-name "$EVENTHUBS_NAMESPACE" -n "$hub" \
        --partition-count "$EVENTHUBS_PARTITIONS" \
        --retention-time-in-hours "$EVENTHUBS_RETENTION_HOURS" --cleanup-policy Delete
    fi
  done

  local eh_conn
  eh_conn="$(az eventhubs namespace authorization-rule keys list -g "$RG" \
    --namespace-name "$EVENTHUBS_NAMESPACE" --name RootManageSharedAccessKey \
    --query primaryConnectionString -o tsv)"
  [[ -n "$eh_conn" ]] \
    || { echo "ERROR: could not read the Event Hubs connection string for $EVENTHUBS_NAMESPACE" >&2; exit 1; }
  keyvault_secret_set_with_retry "$KV" eventhub-connection-string "$eh_conn"
  az keyvault secret show --vault-name "$KV" --name eventhub-connection-string --query id -o tsv >/dev/null

  # Every other PaaS dependency here (Cosmos, Redis, Storage, Key Vault) is private-endpoint-only
  # with public access off, so Event Hubs gets the same treatment rather than sitting on the
  # public internet with a shared-access key as its only protection. A Deny-by-default network
  # ruleset achieves the equivalent; a private endpoint is the idiom already established in
  # this deployment. Everything above is ARM control plane and unaffected -- only the Kafka data
  # plane moves inside the VNet, and that is reached solely from AKS pods.
  local eh_id
  eh_id="$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query id -o tsv)"
  if [[ "$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query publicNetworkAccess -o tsv)" != "Disabled" ]]; then
    az eventhubs namespace update -g "$RG" -n "$EVENTHUBS_NAMESPACE" --public-network-access Disabled >/dev/null
  fi
  create_private_endpoint "$eh_id" namespace "$EVENTHUBS_NAMESPACE" privatelink.servicebus.windows.net

  for hub in rawdeltas deltas; do
    [[ "$(az eventhubs eventhub show -g "$RG" --namespace-name "$EVENTHUBS_NAMESPACE" -n "$hub" --query partitionCount -o tsv 2>/dev/null)" == "$EVENTHUBS_PARTITIONS" ]] \
      || { echo "ERROR: event hub $hub does not have $EVENTHUBS_PARTITIONS partitions" >&2; exit 1; }
  done
  # Without kafkaEnabled the namespace has no Kafka endpoint at all, and the failure would
  # otherwise surface much later as an opaque broker connection error from deli/scribe.
  [[ "$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query kafkaEnabled -o tsv 2>/dev/null)" == "true" ]] \
    || { echo "ERROR: Event Hubs namespace $EVENTHUBS_NAMESPACE does not have Kafka enabled" >&2; exit 1; }
  log "Phase 3 (Event Hubs) VERIFY passed — namespace $EVENTHUBS_NAMESPACE ($tier, kafkaEnabled, zoneRedundant=$(az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query zoneRedundant -o tsv 2>/dev/null)), rawdeltas + deltas at $EVENTHUBS_PARTITIONS partitions, ${EVENTHUBS_RETENTION_HOURS}h retention, private endpoint only, connection string in Key Vault"
}


# ===========================================================================
# Phase 4 (secrets infra) — ServiceAccount + SecretProviderClass, applied before any
# workload that needs them (gitrest/historian in phase4_backends; the 6 Helm services in
# phase5_helm)
# ===========================================================================
phase4_secrets_infra() {
  banner "Phase 4: Secrets infra (ServiceAccount + SecretProviderClass)"
  cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $WORKLOAD_SA_NAME
  namespace: $WORKLOAD_SA_NAMESPACE
  annotations:
    azure.workload.identity/client-id: $WORKLOAD_IDENTITY_CLIENT_ID
    azure.workload.identity/tenant-id: $AZURE_TENANT_ID
EOF

  sed -e "s|<WORKLOAD_IDENTITY_CLIENT_ID>|$WORKLOAD_IDENTITY_CLIENT_ID|g" -e "s|<KV>|$KV|g" \
      -e "s|<AZURE_TENANT_ID>|$AZURE_TENANT_ID|g" \
      "$SELFHOST_ROOT/azure/secretproviderclass.yaml" > "$DEPLOY_DIR/secretproviderclass.yaml"
  grep -q '<[A-Z_]*>' "$DEPLOY_DIR/secretproviderclass.yaml" \
    && { echo "ERROR: unsubstituted placeholder left in the rendered SecretProviderClass:" >&2
         grep -n '<[A-Z_]*>' "$DEPLOY_DIR/secretproviderclass.yaml" >&2; exit 1; }
  kubectl apply -f "$DEPLOY_DIR/secretproviderclass.yaml"

  kubectl get serviceaccount "$WORKLOAD_SA_NAME" -n "$WORKLOAD_SA_NAMESPACE" >/dev/null \
    || { echo "ERROR: ServiceAccount $WORKLOAD_SA_NAME did not apply successfully" >&2; exit 1; }
  kubectl get secretproviderclass fluid-secrets >/dev/null \
    || { echo "ERROR: SecretProviderClass fluid-secrets did not apply successfully" >&2; exit 1; }
  log "Phase 4 (secrets infra) VERIFY passed"
}

# ===========================================================================
# Phase 4 — In-cluster backends (gitrest/historian; mongo is Cosmos DB, redis is Azure Cache,
# both managed and provisioned in phase8, not in-cluster)
# ===========================================================================
phase4_backends() {
  banner "Phase 4: In-cluster backends"
  sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" -e "s|<RG>|$RG|g" -e "s|<STORAGE>|$STORAGE|g" \
      -e "s|<REDIS_HOSTNAME>|$REDIS_HOSTNAME|g" -e "s|<GITREST_STORAGE_QUOTA>|$GITREST_STORAGE_QUOTA|g" \
      -e "s|<HISTORIAN_REPLICAS>|$HISTORIAN_REPLICAS|g" \
  "$RELEASE_DEPLOYMENT_DIR/azure/backends.yaml" > "$DEPLOY_DIR/backends.yaml"
  kubectl apply -f "$DEPLOY_DIR/backends.yaml"
  kubectl wait --for=condition=available deploy/gitrest deploy/historian --timeout=300s
  [[ "$(kubectl get pvc gitrest-data -o jsonpath='{.status.phase}')" == "Bound" ]] \
    || { echo "ERROR: gitrest-data PVC not Bound" >&2; exit 1; }
  log "Phase 4 VERIFY passed"
}

# ===========================================================================
# Phase 5 — Helm install (chart templates patched for workload identity first) + kubectl
# patches (CSI secrets)
# ===========================================================================
phase5_helm() {
  banner "Phase 5: Deploy Routerlicious (Helm)"
  # ServiceAccount + SecretProviderClass are applied by phase4_secrets_infra (it runs before
  # phase4_backends, since gitrest/historian need both too) -- not rendered/applied here.

  # The upstream chart's 6 Deployment templates hard-code their PodSpec with no
  # serviceAccountName field and no values.yaml hook for one. A kubectl-patched
  # serviceAccountName/label does survive `helm upgrade` (unlike the `command` override
  # further below, which the chart strips back out on upgrade), but patching only after
  # install/upgrade still left every FIRST install with a gap: pods start briefly without the
  # workload identity and fail their first Key-Vault CSI mount. Patch identity straight into
  # the chart's own template files (in the $FLUID_ROOT checkout) once per checkout instead, so
  # every install/upgrade -- including the first -- renders it natively.
  local svc
  for svc in alfred nexus deli scriptorium scribe riddler; do
    local chart_tmpl="$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious/templates/$svc-deployment.yaml"
    if grep -qF "serviceAccountName: $WORKLOAD_SA_NAME" "$chart_tmpl"; then
      log "$svc-deployment.yaml chart template already has workload identity, skipping"
    else
      awk -v sa="$WORKLOAD_SA_NAME" '
        { print }
        $0 == "        release: {{ .Release.Name }}" { print "        azure.workload.identity/use: \"true\"" }
        $0 == "    spec:" { print "      serviceAccountName: " sa }
      ' "$chart_tmpl" > "$chart_tmpl.tmp"
      mv "$chart_tmpl.tmp" "$chart_tmpl"
      log "Patched $svc-deployment.yaml chart template with workload identity"
    fi
  done

  # Token lifetime bounds live in azure/routerlicious-values.yaml (the `auth:` block), but the
  # upstream chart writes them into its ConfigMap as literals rather than Helm values, so a
  # values file has nothing to override. Rewrite the two literals to read from `auth:` once per
  # checkout; after this, changing those settings is just editing the values file and re-running.
  local cm_tmpl="$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious/templates/fluid-configmap.yaml"
  awk '
    $0 == "            \"maxTokenLifetimeSec\": 3600," {
      print "            \"maxTokenLifetimeSec\": {{ .Values.auth.maxTokenLifetimeSec }},"; next
    }
    $0 == "            \"enableTokenExpiration\": false" {
      print "            \"enableTokenExpiration\": {{ .Values.auth.enableTokenExpiration }}"; next
    }
    { print }
  ' "$cm_tmpl" > "$cm_tmpl.tmp"
  mv "$cm_tmpl.tmp" "$cm_tmpl"
  grep -qF '.Values.auth.maxTokenLifetimeSec' "$cm_tmpl" \
    && grep -qF '.Values.auth.enableTokenExpiration' "$cm_tmpl" \
    || { echo "ERROR: could not point the auth block in $cm_tmpl at .Values.auth -- upstream changed it." >&2
         exit 1; }

  # Front Door hostnames do not exist yet the first time this phase runs, so fall back to the
  # in-cluster URLs. publish_frontdoor_hostnames writes the real hostnames to $AFD_HOSTS_FILE
  # and re-runs this phase, which is why the substitution is here rather than in a follow-up `helm upgrade`:
  # a bare upgrade re-renders the chart's Deployments and strips the container `command`
  # overrides applied below, which is what injects the Cosmos connection string. Losing them
  # sends every stateful service into CrashLoopBackOff with `MongoParseError: Invalid scheme`.
  local ext_alfred="http://fluid-alfred" ext_nexus="ws://fluid-nexus" ext_historian="http://historian"
  if [[ -f "$AFD_HOSTS_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$AFD_HOSTS_FILE"
    ext_alfred="https://$AFD_ALFRED_HOST"
    ext_nexus="wss://$AFD_NEXUS_HOST"
    ext_historian="https://$AFD_HISTORIAN_HOST"
    log "Rendering chart values with Front Door hostnames ($AFD_ALFRED_HOST)"
  fi

  # nexus's socketIo.gracefulShutdownDrainTimeMs (fluid-configmap.yaml) is 45s, but the
  # upstream chart's nexus-deployment.yaml never sets terminationGracePeriodSeconds, so
  # Kubernetes defaults it to 30s -- 15s short of nexus's own graceful-drain time. Under HPA
  # scale-down (or any pod termination), Kubernetes SIGKILLs the pod before its own drain
  # logic finishes, abruptly severing live client WebSocket connections (observed: a scale-down
  # mid-load-test caused a synchronized client reconnect storm). Patch it in, values-driven.
  local nexus_tmpl="$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious/templates/nexus-deployment.yaml"
  if grep -qF 'terminationGracePeriodSeconds' "$nexus_tmpl"; then
    log "nexus-deployment.yaml chart template already sets terminationGracePeriodSeconds, skipping"
  else
    awk '
      { print }
      $0 == "    spec:" { print "      terminationGracePeriodSeconds: {{ .Values.nexus.terminationGracePeriodSeconds | default 60 }}" }
    ' "$nexus_tmpl" > "$nexus_tmpl.tmp"
    mv "$nexus_tmpl.tmp" "$nexus_tmpl"
    log "Patched nexus-deployment.yaml chart template with terminationGracePeriodSeconds"
  fi

  # The code reads checkpoints:ignoreCheckpointFlushException (lambdas-driver/src/kafka-service/
  # partition.ts) -- without it, a failed final checkpoint flush rethrows and aborts the partition
  # drain on shutdown. The upstream chart's fluid-configmap.yaml never emits the key, so setting it
  # in routerlicious-values.yaml alone is silently inert, and .fluidframework/ is gitignored and
  # re-cloned each deploy, so editing the template by hand does not survive. Patch it in, same as
  # nexus above.
  local cfgmap_tmpl="$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious/templates/fluid-configmap.yaml"
  if grep -qF 'ignoreCheckpointFlushException' "$cfgmap_tmpl"; then
    log "fluid-configmap.yaml chart template already emits ignoreCheckpointFlushException, skipping"
  else
    awk '
      /"kafkaCheckpointOnReprocessingOp": \{\{ \.Values\.checkpoints\.kafkaCheckpointOnReprocessingOp \}\}$/ {
        print $0 ","
        print "            \"ignoreCheckpointFlushException\": {{ .Values.checkpoints.ignoreCheckpointFlushException }}"
        next
      }
      { print }
    ' "$cfgmap_tmpl" > "$cfgmap_tmpl.tmp"
    grep -qF 'ignoreCheckpointFlushException' "$cfgmap_tmpl.tmp" \
      || { echo "ERROR: failed to patch ignoreCheckpointFlushException into $cfgmap_tmpl -- the upstream anchor line may have changed" >&2
           rm -f "$cfgmap_tmpl.tmp"; exit 1; }
    mv "$cfgmap_tmpl.tmp" "$cfgmap_tmpl"
    log "Patched fluid-configmap.yaml chart template with ignoreCheckpointFlushException"
  fi

  # Same problem for Event Hubs: rdkafkaBase.ts switches to SASL_SSL/PLAIN as soon as
  # kafka:lib:eventHubConnString is present, but the chart's kafka.lib block never emits the key,
  # so it has to be patched in the same way. The value is deliberately NOT rendered into the
  # ConfigMap -- that would put the shared-access key in plaintext in a cluster object readable by
  # anyone with get-configmap. Instead the key is emitted as the empty string and the real value
  # arrives at runtime as $kafka__lib__eventHubConnString, exported by the init container from the
  # CSI-mounted Key Vault secret; nconf's env provider overlays it on top of the file config.
  if grep -qF 'eventHubConnString' "$cfgmap_tmpl"; then
    log "fluid-configmap.yaml chart template already emits eventHubConnString, skipping"
  else
    awk '
      /"rdkafkaMaxConsumerCommitRetries": 10$/ {
        print $0 ","
        print "                \"eventHubConnString\": \"\""
        next
      }
      { print }
    ' "$cfgmap_tmpl" > "$cfgmap_tmpl.tmp"
    grep -qF 'eventHubConnString' "$cfgmap_tmpl.tmp" \
      || { echo "ERROR: failed to patch eventHubConnString into $cfgmap_tmpl -- the upstream anchor line may have changed" >&2
           rm -f "$cfgmap_tmpl.tmp"; exit 1; }
    mv "$cfgmap_tmpl.tmp" "$cfgmap_tmpl"
    log "Patched fluid-configmap.yaml chart template with eventHubConnString"
  fi

  sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" \
      -e "s|<REDIS_HOSTNAME>|$REDIS_HOSTNAME|g" \
      -e "s|<KAFKA_ENDPOINT>|$KAFKA_ENDPOINT|g" \
      -e "s|<ALFRED_EXTERNAL_URL>|$ext_alfred|g" \
      -e "s|<NEXUS_EXTERNAL_URL>|$ext_nexus|g" \
      -e "s|<HISTORIAN_EXTERNAL_URL>|$ext_historian|g" \
    "$RELEASE_DEPLOYMENT_DIR/azure/routerlicious-values.yaml" > "$DEPLOY_DIR/routerlicious-values.yaml"
  grep -q '<[A-Z_]*>' "$DEPLOY_DIR/routerlicious-values.yaml" \
    && { echo "ERROR: unsubstituted placeholder left in the rendered chart values:" >&2
         grep -n '<[A-Z_]*>' "$DEPLOY_DIR/routerlicious-values.yaml" >&2; exit 1; }

  # Replica counts come from deploy.parameters.json's microservices.<name>.replicas (defaults
  # match routerlicious-values.yaml's own committed values) -- passed as --set overrides
  # rather than sed-substituted into the values file, so the file's own defaults still work
  # standalone (e.g. a manual `helm install -f routerlicious-values.yaml` with no deploy.sh).
  local helm_replica_overrides=(
    --set "alfred.replicas=$ALFRED_REPLICAS" --set "nexus.replicas=$NEXUS_REPLICAS"
    --set "riddler.replicas=$RIDDLER_REPLICAS" --set "deli.replicas=$DELI_REPLICAS"
    --set "scribe.replicas=$SCRIBE_REPLICAS" --set "scriptorium.replicas=$SCRIPTORIUM_REPLICAS"
  )

  if helm status fluid >/dev/null 2>&1; then
    log "Helm release 'fluid' already exists, upgrading instead of installing"
    helm upgrade fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" \
      -f "$DEPLOY_DIR/routerlicious-values.yaml" "${helm_replica_overrides[@]}"
  else
    helm install fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" \
      -f "$DEPLOY_DIR/routerlicious-values.yaml" "${helm_replica_overrides[@]}"
  fi

  # Patch all 6 services to mount every Key-Vault-backed secret via CSI and wire it into the
  # running process. (Workload identity is handled separately, by the chart-template patch loop
  # above.) An init container writes the CSI-mounted secrets out as nconf `__`-separated env
  # vars into a shared emptyDir file, then each container's command sources that file before
  # running its real entrypoint -- required because nothing in the image itself sources such a
  # file (its ENTRYPOINT is just tini plus a bare `node ...` command).
  patch_secrets_and_command() {
    local deploy="$1" real_cmd="$2" extra_env_json="${3:-[]}"
    local init_script run_script
    # shellcheck disable=SC2016
    # Values are wrapped in literal double-quotes (printf 'export NAME="%s"') because Cosmos
    # Mongo connection strings contain '&', which an unquoted `sh` source would treat as a
    # background-job operator and silently truncate.
    # The env var must be named `mongo__operationsDbEndpoint`, not `mongodb__...` -- the
    # chart's fluid-configmap.yaml renders a JSON key named "mongo", so the runtime nconf path
    # is `mongo:operationsDbEndpoint` even though the chart's own values.yaml uses "mongodb" as
    # its naming convention for that setting. Getting this wrong doesn't crash at startup --
    # nconf silently falls back to the ConfigMap's placeholder value, and only a real Mongo
    # connection attempt later throws `MongoParseError` -- so `kubectl wait
    # --for=condition=available` can report success while this is broken.
    # kafka__lib__eventHubConnString is what flips rdkafkaBase.ts from plaintext to SASL_SSL --
    # the ConfigMap only ever carries an empty string for it, so the broker is unreachable
    # without this line.
    init_script='COSMOS_CONN="$(cat /mnt/secrets/cosmos-connection-string)"; REDIS_PASS="$(cat /mnt/secrets/redis-password)"; EH_CONN="$(cat /mnt/secrets/eventhub-connection-string)"; { printf "export mongo__operationsDbEndpoint=\"%s\"\n" "$COSMOS_CONN"; printf "export redis__pass=\"%s\"\n" "$REDIS_PASS"; printf "export redis2__pass=\"%s\"\n" "$REDIS_PASS"; printf "export redisForThrottling__pass=\"%s\"\n" "$REDIS_PASS"; printf "export redisForTenantCache__pass=\"%s\"\n" "$REDIS_PASS"; printf "export kafka__lib__eventHubConnString=\"%s\"\n" "$EH_CONN"; } > /config/secrets.env'
    run_script="test -f /config/secrets.env && . /config/secrets.env; exec $real_cmd"

    # HPA (azure/hpa.yaml) requires each container to have resources.requests.cpu set, or the
    # HPA controller can't compute a utilization percentage; deli/scriptorium/scribe run as
    # fixed replicas (no HPA, see hpa.yaml) but still get explicit requests/limits so
    # `kubectl top`/capacity planning has real numbers instead of the chart's default of none.
    # The chart sets no "resources" key anywhere, so this is patched in post-install. Each of
    # the 6 services below gets its own specific requests/limits.
    #
    # deli's limit dropped from an earlier 2Gi to 1Gi despite a real V8 "JavaScript heap out of
    # memory" crash at 2.5x traffic (400 concurrent clients) with only 2 replicas -- going to
    # 32 fixed replicas (one per rawdeltas partition, see hpa.yaml's comment) spreads that same
    # document-partition bookkeeping across 16x more pods, so per-pod memory pressure at the
    # same overall traffic is expected to drop well below the old 2-replica ceiling. Not yet
    # re-validated by an actual load test at 32 replicas (still pending, see ARCHITECTURE.md
    # Section 3/7.9) -- worth re-confirming under real load.
    if [[ -n "$(kubectl get deployment "$deploy" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}' 2>/dev/null)" ]]; then
      log "$deploy already has CPU/memory resource requests, skipping"
    else
      local resources_patch_file="$DEPLOY_DIR/patch-$deploy-resources.json"
      case "$deploy" in
        fluid-alfred)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "160m", "memory": "1.5G"},
              "limits": {"cpu": "3", "memory": "4Gi"}
            }}
          ]' > "$resources_patch_file"
          ;;
        fluid-riddler)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "60m", "memory": "400M"},
              "limits": {"cpu": "3", "memory": "512Mi"}
            }}
          ]' > "$resources_patch_file"
          ;;
        fluid-nexus)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "120m", "memory": "1.5G"},
              "limits": {"cpu": "3", "memory": "3Gi"}
            }}
          ]' > "$resources_patch_file"
          ;;
        fluid-deli)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "180m", "memory": "512Mi"},
              "limits": {"cpu": "3", "memory": "2Gi"}
            }}
          ]' > "$resources_patch_file"
          ;;
        fluid-scribe)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "200m", "memory": "512Mi"},
              "limits": {"cpu": "3", "memory": "2Gi"}
            }}
          ]' > "$resources_patch_file"
          ;;
        fluid-scriptorium)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "500m", "memory": "256Mi"},
              "limits": {"cpu": "3", "memory": "1Gi"}
            }}
          ]' > "$resources_patch_file"
          ;;
        *)
          jq -n '[
            {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
              "requests": {"cpu": "250m", "memory": "256Mi"},
              "limits": {"cpu": "1", "memory": "512Mi"}
            }}
          ]' > "$resources_patch_file"
          ;;
      esac
      kubectl patch deployment "$deploy" --type=json --patch-file="$resources_patch_file"
    fi

    if kubectl get deployment "$deploy" -o jsonpath='{.spec.template.spec.volumes[?(@.name=="fluid-secrets")]}' 2>/dev/null | grep -q .; then
      log "$deploy already has CSI secrets volumes/init-container, skipping that part"
    else
      local setup_patch_file="$DEPLOY_DIR/patch-$deploy-setup.json"
      jq -n --arg initScript "$init_script" '[
        {"op": "add", "path": "/spec/template/spec/volumes/-", "value": {
          "name": "fluid-secrets",
          "csi": {"driver": "secrets-store.csi.k8s.io", "readOnly": true,
                  "volumeAttributes": {"secretProviderClass": "fluid-secrets"}}
        }},
        {"op": "add", "path": "/spec/template/spec/volumes/-", "value": {"name": "fluid-secrets-env", "emptyDir": {}}},
        {"op": "add", "path": "/spec/template/spec/initContainers", "value": [{
          "name": "load-secrets", "image": "busybox",
          "command": ["sh", "-c", $initScript],
          "volumeMounts": [
            {"name": "fluid-secrets", "mountPath": "/mnt/secrets", "readOnly": true},
            {"name": "fluid-secrets-env", "mountPath": "/config"}]
        }]},
        {"op": "add", "path": "/spec/template/spec/containers/0/volumeMounts/-", "value": {"name": "fluid-secrets-env", "mountPath": "/config", "readOnly": true}}
      ]' > "$setup_patch_file"
      kubectl patch deployment "$deploy" --type=json --patch-file="$setup_patch_file"
    fi

    # The init container's script is only written once, in the "add" branch above -- it is not
    # re-synced if `init_script`'s content changes later. Re-check and reapply on every run so
    # existing deployments pick up script fixes too.
    local current_init_cmd
    current_init_cmd="$(kubectl get deployment "$deploy" -o jsonpath='{.spec.template.spec.initContainers[0].command[2]}' 2>/dev/null)"
    if [[ "$current_init_cmd" == "$init_script" ]]; then
      log "$deploy init-container script already up to date, skipping"
    else
      local init_patch_file="$DEPLOY_DIR/patch-$deploy-init.json"
      jq -n --arg initScript "$init_script" '[
        {"op": "replace", "path": "/spec/template/spec/initContainers/0/command", "value": ["sh", "-c", $initScript]}
      ]' > "$init_patch_file"
      kubectl patch deployment "$deploy" --type=json --patch-file="$init_patch_file"
    fi

    # The container command override does NOT survive `helm upgrade` -- the chart's template
    # has no opinion on `command` (relies on the image's bare ENTRYPOINT/CMD), so every `helm
    # upgrade` re-applies the chart's rendered manifest and strips this override back out,
    # while leaving the extra volumes/init-container alone (untouched by the chart, so a
    # strategic merge never touches them). Re-check and reapply unconditionally on every run --
    # a JSON "replace" op is always safe to repeat, unlike the "add" ops for
    # volumes/init-container above, which fail if redone.
    local current_cmd
    current_cmd="$(kubectl get deployment "$deploy" -o jsonpath='{.spec.template.spec.containers[0].command}')"
    if [[ "$current_cmd" == '["sh","-c",'* ]]; then
      log "$deploy command already wraps secrets sourcing, skipping"
    else
      local cmd_patch_file="$DEPLOY_DIR/patch-$deploy-cmd.json"
      jq -n --arg runScript "$run_script" '[
        {"op": "replace", "path": "/spec/template/spec/containers/0/command", "value": ["sh", "-c", $runScript]}
      ]' > "$cmd_patch_file"
      kubectl patch deployment "$deploy" --type=json --patch-file="$cmd_patch_file"
    fi

    # Any extra per-service env vars (currently just kafka__lib__disableTopicCreation for the
    # 3 Kafka consumer-role services, see the deli/scribe/scriptorium call sites below) --
    # checked/added independently per var name, same idempotent pattern as everything above.
    local extra_env_count
    extra_env_count="$(jq 'length' <<<"$extra_env_json")"
    local i
    for ((i = 0; i < extra_env_count; i++)); do
      local var_name var_value
      var_name="$(jq -r ".[$i].name" <<<"$extra_env_json")"
      var_value="$(jq -r ".[$i].value" <<<"$extra_env_json")"
      if kubectl get deployment "$deploy" -o jsonpath="{.spec.template.spec.containers[0].env[?(@.name==\"$var_name\")]}" 2>/dev/null | grep -q .; then
        log "$deploy already has $var_name env var, skipping"
      else
        local env_patch_file="$DEPLOY_DIR/patch-$deploy-env-$var_name.json"
        jq -n --arg name "$var_name" --arg value "$var_value" '[
          {"op": "add", "path": "/spec/template/spec/containers/0/env/-", "value": {"name": $name, "value": $value}}
        ]' > "$env_patch_file"
        kubectl patch deployment "$deploy" --type=json --patch-file="$env_patch_file"
      fi
    done
  }

  patch_secrets_and_command fluid-alfred "node packages/routerlicious/dist/alfred/www.js" "$KAFKA_TUNING_ENV_JSON"
  patch_secrets_and_command fluid-nexus "node packages/routerlicious/dist/nexus/www.js" "$KAFKA_TUNING_ENV_JSON"
  patch_secrets_and_command fluid-riddler "node packages/routerlicious/dist/riddler/www.js" "$KAFKA_TUNING_ENV_JSON"
  # deli and scribe get an explicit V8 heap ceiling: Node defaults it to roughly half the
  # container limit, so raising `limits.memory` alone leaves the extra memory unreachable to the
  # JS heap. Both have hit "JavaScript heap out of memory" while draining a large backlog --
  # scribe confirmed live at ~506MB against a 1Gi limit.
  patch_secrets_and_command fluid-deli "node --max-old-space-size=1536 packages/routerlicious/dist/kafka-service/index.js deli /usr/src/server/packages/routerlicious/dist/deli/index.js" "$KAFKA_TUNING_ENV_JSON"
  patch_secrets_and_command fluid-scribe "node --max-old-space-size=1536 packages/routerlicious/dist/kafka-service/index.js scribe /usr/src/server/packages/routerlicious/dist/scribe/index.js" "$KAFKA_TUNING_ENV_JSON"
  patch_secrets_and_command fluid-scriptorium "node packages/routerlicious/dist/kafka-service/index.js scriptorium /usr/src/server/packages/routerlicious/dist/scriptorium/index.js" "$KAFKA_TUNING_ENV_JSON"

  # Helm only patches a field if it differs from ITS OWN previous release's rendered value --
  # if deli/scribe/scriptorium's replicas ever drift out-of-band (e.g. a manual `kubectl
  # scale`, or a leftover HPA from before these 3 were fixed-replica-only), `helm upgrade`
  # sees no diff for that field and silently leaves the drifted value in place forever. These
  # 3 deliberately have no HPA (autoscaling a Kafka consumer-group deployment forces a full
  # partition-assignment rebalance on every scale event), so there's nothing else to converge
  # them -- just assert the fixed count directly on every run instead of trusting helm to.
  kubectl scale deployment fluid-deli --replicas="$DELI_REPLICAS"
  kubectl scale deployment fluid-scribe --replicas="$SCRIBE_REPLICAS"
  kubectl scale deployment fluid-scriptorium --replicas="$SCRIPTORIUM_REPLICAS"

  kubectl wait --for=condition=available deploy/fluid-alfred deploy/fluid-nexus deploy/fluid-deli \
    deploy/fluid-scriptorium deploy/fluid-scribe deploy/fluid-riddler --timeout=300s
  log "Phase 5 VERIFY passed"
}

# ===========================================================================
# Phase 5 (bootstrap tenant) -- the chart no longer seeds any tenant into riddler's static
# config (see azure/routerlicious-values.yaml), so nothing exists for a client to authenticate
# against until one is created. Bootstrap the default "fluid" tenant the exact same way any
# other tenant is created -- via tenant-admin.sh -- so it is a normal, fully-durable Cosmos DB
# record with no chart-driven re-upsert/wipe to work around (see tenant-admin/README.md).
# ===========================================================================
phase5_bootstrap_tenant() {
  banner "Phase 5: Bootstrap default tenant"
  if "$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMS_FILE" get fluid >/dev/null 2>&1; then
    log "fluid tenant already exists, skipping"
  else
    "$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMS_FILE" create fluid \
      --contact "selfhost-bootstrap@example.invalid"
  fi
  "$SELFHOST_ROOT/tenant-admin/tenant-admin.sh" --params "$PARAMS_FILE" get-key fluid >/dev/null
  log "Phase 5 (bootstrap tenant) VERIFY passed"
}

# ===========================================================================
# Phase 6 — Expose LoadBalancer Services
# ===========================================================================
phase6_expose() {
  banner "Phase 6: Expose + client validation endpoints"
  kubectl get svc fluid-alfred-public >/dev/null 2>&1 || \
    kubectl expose deploy/fluid-alfred --name fluid-alfred-public --type LoadBalancer --port 80 --target-port ui
  kubectl get svc fluid-nexus-public >/dev/null 2>&1 || \
    kubectl expose deploy/fluid-nexus --name fluid-nexus-public --type LoadBalancer --port 80 --target-port ui
  kubectl get svc historian-public >/dev/null 2>&1 || \
    kubectl expose deploy/historian --name historian-public --type LoadBalancer --port 80 --target-port 3000

  log "Waiting for LoadBalancer external IPs..."
  for svc in fluid-alfred-public fluid-nexus-public historian-public; do
    for _ in $(seq 1 60); do
      ip="$(kubectl get svc "$svc" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
      [[ -n "$ip" ]] && break
      sleep 5
    done
    [[ -n "$ip" ]] || { echo "ERROR: $svc never got a LoadBalancer IP" >&2; exit 1; }
    log "$svc external IP: $ip"
  done
  log "Phase 6 VERIFY passed — endpoints are HTTP only until Phase 12 (Front Door) runs"
}

# ===========================================================================
# Phase 10 — HPA + multi-replica application tier
# ===========================================================================
phase10_hpa() {
  banner "Phase 10: Application-tier HPA"
  sed -e "s|<ALFRED_HPA_MIN>|$ALFRED_HPA_MIN|g" -e "s|<ALFRED_HPA_MAX>|$ALFRED_HPA_MAX|g" \
      -e "s|<NEXUS_HPA_MIN>|$NEXUS_HPA_MIN|g" -e "s|<NEXUS_HPA_MAX>|$NEXUS_HPA_MAX|g" \
      -e "s|<RIDDLER_HPA_MIN>|$RIDDLER_HPA_MIN|g" -e "s|<RIDDLER_HPA_MAX>|$RIDDLER_HPA_MAX|g" \
      -e "s|<HISTORIAN_HPA_MIN>|$HISTORIAN_HPA_MIN|g" -e "s|<HISTORIAN_HPA_MAX>|$HISTORIAN_HPA_MAX|g" \
      "$SELFHOST_ROOT/azure/hpa.yaml" > "$DEPLOY_DIR/hpa.yaml"
  kubectl apply -f "$DEPLOY_DIR/hpa.yaml"
  kubectl get hpa fluid-alfred-hpa >/dev/null 2>&1 \
    || { echo "ERROR: HPAs did not apply successfully" >&2; exit 1; }
  kubectl get hpa historian-hpa >/dev/null 2>&1 \
    || { echo "ERROR: historian-hpa did not apply successfully" >&2; exit 1; }
  log "Phase 10 VERIFY passed"
}

# ===========================================================================
# Phase 12 — Azure Front Door (Premium), default azurefd.net hostname only
# ===========================================================================
publish_frontdoor_hostnames() {
  local afd_alfred afd_nexus afd_historian advertised
  afd_alfred="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "alfred-${AFD}" --query hostName -o tsv 2>/dev/null)" \
    || { echo "ERROR: Front Door endpoint 'alfred-${AFD}' does not exist." >&2; exit 1; }
  afd_nexus="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "nexus-${AFD}" --query hostName -o tsv 2>/dev/null)" \
    || { echo "ERROR: Front Door endpoint 'nexus-${AFD}' does not exist." >&2; exit 1; }
  afd_historian="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "historian-${AFD}" --query hostName -o tsv 2>/dev/null)" \
    || { echo "ERROR: Front Door endpoint 'historian-${AFD}' does not exist." >&2; exit 1; }
  [[ -n "$afd_alfred" && -n "$afd_nexus" && -n "$afd_historian" ]] \
    || { echo "ERROR: could not resolve all Front Door endpoint hostnames." >&2; exit 1; }

  advertised="$(kubectl get configmap fluid-routerlicious -o jsonpath='{.data.config\.json}' 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("worker",{}).get("blobStorageUrl",""))' 2>/dev/null || true)"
  if [[ "$advertised" == "https://$afd_historian" ]]; then
    log "Discovery already advertises the Front Door hostnames, skipping re-run"
    return 0
  fi

  log "Publishing Front Door hostnames into the chart's discovery values"
  cat > "$AFD_HOSTS_FILE" <<EOF
AFD_ALFRED_HOST=$afd_alfred
AFD_NEXUS_HOST=$afd_nexus
AFD_HISTORIAN_HOST=$afd_historian
EOF
  phase5_helm
  kubectl rollout status deploy/fluid-alfred --timeout=300s >/dev/null 2>&1 || true
  advertised="$(kubectl get configmap fluid-routerlicious -o jsonpath='{.data.config\.json}' 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("worker",{}).get("blobStorageUrl",""))' 2>/dev/null || true)"
  [[ "$advertised" == "https://$afd_historian" ]] \
    || { echo "ERROR: discovery still advertises '$advertised' instead of https://$afd_historian" >&2; exit 1; }
  log "Discovery now advertises https://$afd_alfred and https://$afd_historian"
}

phase12_frontdoor() {
  banner "Phase 12: Azure Front Door (TLS)"
  if az afd profile show -g "$RG" --profile-name "$AFD" >/dev/null 2>&1; then
    local current_sku
    current_sku="$(az afd profile show -g "$RG" --profile-name "$AFD" --query sku.name -o tsv)"
    if [[ "$current_sku" == "Premium_AzureFrontDoor" ]]; then
      log "Front Door profile $AFD already exists on Premium_AzureFrontDoor, skipping create"
    else
      # `az afd profile update` has no --sku flag and there's no separate upgrade command --
      # the CLI can't change an existing profile's tier in place. Deleting and recreating would
      # drop live traffic, so this stops here instead of doing that silently.
      echo "ERROR: Front Door profile $AFD already exists on SKU '$current_sku', not Premium_AzureFrontDoor." >&2
      echo "The CLI cannot upgrade an existing profile's tier in place. Either delete and recreate" >&2
      echo "$AFD yourself (this drops live traffic while it's gone), or use the Azure Portal's" >&2
      echo "upgrade flow if available for your tier combination, then re-run this script." >&2
      exit 1
    fi
  else
    az afd profile create -g "$RG" --profile-name "$AFD" --sku Premium_AzureFrontDoor
  fi

  # Applied unconditionally (not just at create time) so a changed value actually takes effect
  # on a re-run against an already-deployed profile.
  az afd profile update -g "$RG" --profile-name "$AFD" \
    --origin-response-timeout-seconds "$AFD_RESPONSE_TIMEOUT_SECONDS" >/dev/null

  # nexus is Routerlicious's delta-stream service -- clients connect over WebSocket (Socket.IO),
  # e.g. wss://<nexus-hostname>/socket.io/?transport=websocket. This needs no special
  # route/config: Front Door Standard/Premium natively passes through the WebSocket upgrade
  # headers on any ordinary HTTPS route, so the settings below already cover it. Front Door's
  # fixed 90s idle-connection timeout isn't an issue since Socket.IO's default ping/pong
  # heartbeat (~25s) keeps the connection active well under that threshold.
  # Endpoint names are suffixed with the profile name. Front Door derives an endpoint's
  # hostname as <endpointName>-<hash>, and that hash is deterministic per name within a tenant:
  # a bare "alfred" produces the same hostname in every deployment. Two concurrent deployments
  # would then contend for one hostname, and a hostname freed by deleting a profile can keep
  # resolving to the dead profile at some edges -- which surfaces as an intermittent 502 that
  # looks like an origin fault.
  for svc in alfred nexus historian; do
    local lb_svc lb_host probe_path endpoint_name
    case "$svc" in
      alfred) lb_svc=fluid-alfred-public; probe_path=/api/v1/ping ;;
      nexus) lb_svc=fluid-nexus-public; probe_path=/healthz/startup ;;
      historian) lb_svc=historian-public; probe_path=/repos/ping ;;
    esac
    lb_host="$(kubectl get svc "$lb_svc" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
    endpoint_name="${svc}-${AFD}"

    az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "$endpoint_name" >/dev/null 2>&1 || \
      az afd endpoint create -g "$RG" --profile-name "$AFD" --endpoint-name "$endpoint_name" --enabled-state Enabled
    if az afd origin-group show -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" >/dev/null 2>&1; then
      # Update in place (not just create-if-missing) so a probe-path change actually takes
      # effect on a re-run against an already-deployed origin group.
      az afd origin-group update -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" \
        --probe-request-type GET --probe-protocol Http --probe-path "$probe_path" \
        --probe-interval-in-seconds 30 --sample-size 4 --successful-samples-required 3
    else
      az afd origin-group create -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" \
        --probe-request-type GET --probe-protocol Http --probe-path "$probe_path" \
        --probe-interval-in-seconds 30 --sample-size 4 --successful-samples-required 3
    fi
    az afd origin show -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" --origin-name "${svc}-origin" >/dev/null 2>&1 || \
      az afd origin create -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" --origin-name "${svc}-origin" \
        --host-name "$lb_host" --origin-host-header "$lb_host" --http-port 80 --priority 1 --weight 1000 --enabled-state Enabled
    az afd route show -g "$RG" --profile-name "$AFD" --endpoint-name "$endpoint_name" --route-name "${svc}-route" >/dev/null 2>&1 || \
      az afd route create -g "$RG" --profile-name "$AFD" --endpoint-name "$endpoint_name" --route-name "${svc}-route" \
        --origin-group "${svc}-og" --supported-protocols Https --patterns-to-match "/*" \
        --forwarding-protocol HttpOnly --https-redirect Enabled --link-to-default-domain Enabled

    local hostname; hostname="$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "$endpoint_name" --query hostName -o tsv)"
    # nexus is the WebSocket/Socket.IO delta-stream service -- print its client-facing scheme
    # as wss:// (clients connect via wss://<host>/socket.io/?transport=websocket), not https://.
    local scheme=https; [[ "$svc" == "nexus" ]] && scheme=wss
    log "$svc Front Door hostname: $scheme://$hostname (probe: $probe_path)"
  done

  publish_frontdoor_hostnames

  log "Phase 12 VERIFY passed — see phase12_restrict_origin_nsg for the origin NSG restriction"
}

# ===========================================================================
# Phase 12 Step 2 -- restrict the origin LoadBalancer Services to Front Door only
# ===========================================================================
# The AKS node pool's NSG (found via nodeResourceGroup, since that's the NSG actually enforced
# on the nodes' NICs, not the aks-subnet's own NSG) gets an explicit Allow for
# AzureFrontDoor.Backend plus an explicit Deny for Internet, both on port 80 and both at a
# lower priority than the cloud-provider's own auto-created LB-allow rule -- so non-AFD
# internet traffic is denied before it reaches that rule. One NSG is shared by all AKS nodes,
# so this single pair of rules covers alfred, nexus, and historian's LoadBalancer IPs at once.
#
# Caveat: some Azure environments have their own policy-auto-attached baseline NSG rules
# (permitting broad access from the organization's own internal network, at a lower priority
# than anything added here), so a direct curl from a machine on that internal network will
# still succeed -- that's the pre-existing organizational policy taking precedence, not a gap
# in this restriction. Only genuine external, non-Front-Door traffic is actually denied.
phase12_restrict_origin_nsg() {
  banner "Phase 12 Step 2: Restrict origin LoadBalancer Services to Front Door only"
  local node_rg nsg_name

  # Organization policy can attach and populate the subnet NSG long after Phase 0's initial
  # poll. Reconcile it again now, immediately before testing the finished Front Door routes.
  phase0_network_allow_frontdoor

  node_rg="$(az aks show -g "$RG" -n "$AKS" --query nodeResourceGroup -o tsv)"
  nsg_name="$(az network nsg list -g "$node_rg" --query "[0].name" -o tsv)"
  if [[ -z "$nsg_name" ]]; then
    local subnet_nsg_id
    subnet_nsg_id="$(az network vnet subnet show -g "$RG" --vnet-name "$VNET" -n aks-subnet \
      --query networkSecurityGroup.id -o tsv)"
    [[ -n "$subnet_nsg_id" ]] \
      || { echo "ERROR: neither the AKS node resource group nor aks-subnet has an NSG." >&2; exit 1; }
    log "No node-resource-group NSG exists; the subnet NSG and its default inbound deny enforce the Front Door restriction"
  else
    ensure_frontdoor_nsg_allow "$node_rg" "$nsg_name"
    if az network nsg rule show -g "$node_rg" --nsg-name "$nsg_name" -n DenyDirectInternetOnPort80 >/dev/null 2>&1; then
      log "DenyDirectInternetOnPort80 rule already exists on $nsg_name, skipping"
    else
      az network nsg rule create -g "$node_rg" --nsg-name "$nsg_name" -n DenyDirectInternetOnPort80 \
        --priority 120 --source-address-prefixes Internet --destination-port-ranges 80 \
        --access Deny --protocol Tcp --direction Inbound >/dev/null
    fi
    az network nsg rule show -g "$node_rg" --nsg-name "$nsg_name" -n DenyDirectInternetOnPort80 >/dev/null \
      || { echo "ERROR: DenyDirectInternetOnPort80 is missing from $nsg_name after create" >&2; exit 1; }
  fi

  verify_frontdoor_origin_health
  log "Phase 12 Step 2 VERIFY passed -- all Front Door origins are healthy and reachable"
}

verify_frontdoor_origin_health() {
  local attempt svc path hostname status all_healthy
  for attempt in {1..20}; do
    all_healthy=true
    for svc in alfred nexus historian; do
      case "$svc" in
        alfred) path=/api/v1/ping ;;
        nexus) path=/healthz/startup ;;
        historian) path=/repos/ping ;;
      esac
      hostname="$(az afd endpoint show -g "$RG" --profile-name "$AFD" \
        --endpoint-name "${svc}-${AFD}" --query hostName -o tsv)"
      status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 \
        "https://${hostname}${path}" 2>/dev/null || true)"
      if [[ "$status" != "200" ]]; then
        all_healthy=false
        log "$svc Front Door health check returned HTTP ${status:-000} (attempt $attempt/20)"
      fi
    done
    if [[ "$all_healthy" == true ]]; then
      return 0
    fi
    [[ "$attempt" -lt 20 ]] && sleep 15
  done
  echo "ERROR: Front Door origins did not become healthy within 5 minutes (20 attempts)." >&2
  echo "" >&2
  echo "Everything else deployed successfully -- this is the last gate, and the usual cause is" >&2
  echo "Front Door DNS propagation simply taking longer than that budget." >&2
  echo "" >&2
  echo "  What to do: re-run the same command. Every phase skips work that already exists, so" >&2
  echo "  it goes straight back to this check." >&2
  echo "" >&2
  echo "If it fails again on a re-run, it is not propagation. Check OriginHealthPercentage in" >&2
  echo "the Front Door profile, and that the AzureFrontDoor.Backend allow rule still precedes" >&2
  echo "any Internet deny rule on the AKS node NSG." >&2
  return 1
}

# ===========================================================================
# Deploy-only mode setup
# ===========================================================================
initialize_deploy_only_mode() {
  banner "Resolving existing infrastructure (deploy-only mode)"
  az aks show -g "$RG" -n "$AKS" >/dev/null 2>&1 \
    || { echo "ERROR: AKS cluster '$AKS' not found in resource group '$RG'." >&2
         echo "  --mode deploy-only requires the infrastructure to already exist." >&2
         exit 1; }

  az aks get-credentials -g "$RG" -n "$AKS" --overwrite-existing
  [[ "$(kubectl get nodes --no-headers | grep -c Ready)" -ge 1 ]] \
    || { echo "ERROR: no Ready nodes in $AKS" >&2; exit 1; }

  WORKLOAD_IDENTITY_CLIENT_ID="$(az identity show -g "$RG" -n "$WORKLOAD_IDENTITY" --query clientId -o tsv 2>/dev/null || true)"
  AZURE_TENANT_ID="$(az account show --query tenantId -o tsv)"
  REDIS_HOSTNAME="$(az redis show -n "$REDIS" -g "$RG" --query hostName -o tsv 2>/dev/null || true)"
  [[ -n "$WORKLOAD_IDENTITY_CLIENT_ID" ]] \
    || { echo "ERROR: could not resolve workload identity '$WORKLOAD_IDENTITY' clientId in $RG — is the infrastructure fully deployed?" >&2; exit 1; }
  [[ -n "$REDIS_HOSTNAME" ]] \
    || { echo "ERROR: could not resolve Redis cache '$REDIS' hostname in $RG — is the infrastructure fully deployed?" >&2; exit 1; }
  log "Resolved existing infra — WORKLOAD_IDENTITY_CLIENT_ID=$WORKLOAD_IDENTITY_CLIENT_ID REDIS_HOSTNAME=$REDIS_HOSTNAME"
}

# ===========================================================================
# Main
# ===========================================================================
if [[ "$MODE" == "deploy-only" ]]; then
  log "Mode: deploy-only — skipping infrastructure phases, deploying release '$RELEASE_ID' onto existing infrastructure"
  # Deploy-only mode re-applies whatever changes between runs: the release bundle's own
  # manifests AND the config-driven values from deploy.parameters.json. The one-time setup phases below are
  # not repeated here:
  #   phase4_secrets_infra      — ServiceAccount + SecretProviderClass (referenced by name;
  #                               already present)
  #   phase5_bootstrap_tenant   — creates the default tenant in Cosmos DB (already present)
  #   phase6_expose             — LoadBalancer Services (persist; phase12 reads their IPs)
  #   phase12_restrict_origin_nsg — origin NSG hardening rules
  #   phase3_eventhubs          — Event Hubs is infrastructure, not part of the release. Its
  #                               namespace, hubs and Key Vault secret already exist, and
  #                               re-running it would try to write to a Key Vault that
  #                               phase8_keyvault_lockdown has since closed to this workstation.
  #                               KAFKA_ENDPOINT is derived from config at startup, so the chart
  #                               still gets it without this phase.
  # publish_frontdoor_hostnames re-publishes the real Front Door hostnames into the chart's
  # discovery values without changing any Front Door configuration.
  initialize_deploy_only_mode
  phase1_images
  phase4_backends
  phase5_helm
  phase10_hpa
  publish_frontdoor_hostnames
else
  log "Mode: full — new deployment (infrastructure + release '$RELEASE_ID')"
  phase0_rg_acr
  phase0_network
  phase0_network_allow_frontdoor
  phase1_images
  phase1_aks
  phase1_gitrest_nodepool
  phase2_acr_harden
  phase8_workload_identity
  phase8_keyvault
  phase8_cosmos
  phase8_redis
  phase8_storage
  # Must precede phase8_keyvault_lockdown: it writes eventhub-connection-string to Key Vault,
  # which is only reachable from this workstation while public network access is still enabled.
  phase3_eventhubs
  phase8_keyvault_lockdown
  phase4_secrets_infra
  phase4_backends
  phase5_helm
  phase5_bootstrap_tenant
  phase6_expose
  phase10_hpa
  phase12_frontdoor
  phase12_restrict_origin_nsg
fi

banner "Deployment complete"
log "alfred:     https://$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "alfred-${AFD}" --query hostName -o tsv)"
# nexus is the WebSocket/Socket.IO delta-stream service -- printed as wss:// to match how
# clients actually connect to it.
log "nexus:      wss://$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "nexus-${AFD}" --query hostName -o tsv)"
log "historian:  https://$(az afd endpoint show -g "$RG" --profile-name "$AFD" --endpoint-name "historian-${AFD}" --query hostName -o tsv)"
log ""
log "Identity + network posture: Key Vault, Cosmos DB, Azure Cache for Redis, the Storage"
log "Account, and the Event Hubs namespace all have public network access disabled and are only"
log "reachable from the $VNET VNet (private endpoints). Event Hubs uses a shared-access-key"
log "connection string held in Key Vault. All 8 app workloads authenticate as the one"
log "workload identity ($WORKLOAD_IDENTITY) for Key Vault; ACR pulls and the"
log "Storage account key fetch remain on the AKS kubelet/cluster identities (system"
log "components, not workload-identity-federatable — see phase8_workload_identity)."
log ""
log "Reminder: this remains a reference deployment. It still uses InsecureTokenProvider (no"
log "Token Function / Entra ID auth — see azure/README.md Phase 7 to add that separately)."
log "Full log: $LOG_FILE"
