#!/usr/bin/env bash
# tenant-admin/tenant-admin.sh -- operator entry point for tenant management on an AKS-deployed
# self-host stack.
#
# WHY THIS WRAPPER EXISTS
#
# riddler and gitrest are ClusterIP-only Services with NO authentication (riddler's
# GET /api/tenants/:id/keys returns plaintext signing keys to any caller that can reach it).
# They are deliberately not exposed, so tenant management runs *inside* the cluster: this script
# ships tenant-admin's source into a short-lived Pod built from the same routerlicious image the
# stack already runs, executes one command, collects the JSON result and deletes the Pod.
#
# Running in-cluster rather than locally also means the only prerequisites are the ones
# azure/deploy.sh already requires (az, jq, kubectl) -- Node.js comes from the container image.
#
# The authorization boundary is therefore "can you get cluster credentials for this AKS
# cluster", which is Azure RBAC on the cluster resource. That is appropriate for the self-host
# model, where the operator standing up the stack is the same person creating tenants. It is
# NOT per-user authorization: anyone who can run this can read every tenant key. If tenant
# management ever needs delegating to someone who should not own the cluster, put an
# authenticated service in front of riddler and have it call src/tenantManager.js directly.
#
# WHERE TENANT KEYS LIVE
#
# Riddler generates a tenant's keys and stores them in the operations database. For every tenant
# this tool creates -- including the default "fluid" tenant, which azure/deploy.sh bootstraps
# through this same tool (phase5_bootstrap_tenant) -- that database IS the durable copy: nothing
# re-upserts or resets them, so they survive pod restarts, node reboots and cluster stop/start.
# Riddler is also the only service that writes tenant documents at all.
#
# There is therefore no Key Vault mirroring here. `get-key <tenantId>` re-reads a key from
# riddler whenever it is needed, which is a better arrangement than a second copy that has to be
# kept in sync. (A tenant manually added to the Helm chart's riddler.tenants values would NOT
# have this durability -- riddler re-upserts anything listed there from static, key-less config
# on every restart -- which is exactly why nothing is seeded there anymore.)
#
# `rotate` does READ one Key Vault secret, but only to answer "is this the key the token service
# is signing with right now?" before destroying it -- see the check further down. It never
# writes, and the read happens inside the cluster so the vault stays closed to the internet.
#
# Usage:
#   tenant-admin/tenant-admin.sh [--params <file>] [--namespace <ns>] <command> [args...]
#
# Examples:
#   tenant-admin/tenant-admin.sh create contoso --contact owner@contoso.com
#   tenant-admin/tenant-admin.sh list
#   tenant-admin/tenant-admin.sh get contoso
#   tenant-admin/tenant-admin.sh rotate contoso --key key2
#   tenant-admin/tenant-admin.sh delete contoso
#   tenant-admin/tenant-admin.sh help
set -euo pipefail

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELFHOST_ROOT="$(cd "$CLI_DIR/.." && pwd)"
PARAMS_FILE="$SELFHOST_ROOT/azure/deploy.parameters.json"
NAMESPACE="default"

# ---------------------------------------------------------------------------
# Wrapper-level flags. Everything not consumed here is forwarded to the CLI.
# ---------------------------------------------------------------------------
CLI_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --params) PARAMS_FILE="$2"; shift 2 ;;
    --params=*) PARAMS_FILE="${1#*=}"; shift ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --namespace=*) NAMESPACE="${1#*=}"; shift ;;
    *) CLI_ARGS+=("$1"); shift ;;
  esac
done

if [ "${#CLI_ARGS[@]}" -eq 0 ]; then
  CLI_ARGS=(help)
fi
COMMAND="${CLI_ARGS[0]}"

# `help` needs no cluster and no parameters file -- answer it locally.
if [ "$COMMAND" = "help" ] || [ "$COMMAND" = "--help" ] || [ "$COMMAND" = "-h" ]; then
  node "$CLI_DIR/bin/tenant-admin.js" help 2>/dev/null || sed -n '1,45p' "${BASH_SOURCE[0]}"
  exit 0
fi

for tool in az jq kubectl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: required tool '$tool' not found." >&2; exit 1; }
done
[ -f "$PARAMS_FILE" ] || { echo "ERROR: parameters file not found: $PARAMS_FILE" >&2; exit 1; }

jqr() { jq -r "$1 // empty" "$PARAMS_FILE"; }
SUB="$(jqr '.subscriptionId')"
RG="$(jqr '.resourceGroup')"
AKS="$(jqr '.aks.name')"
[ -n "$RG" ] && [ -n "$AKS" ] || { echo "ERROR: resourceGroup / aks.name missing from $PARAMS_FILE" >&2; exit 1; }

[ -n "$SUB" ] && az account set --subscription "$SUB" >/dev/null 2>&1 || true

# Attribute the action to the signed-in Azure identity. Riddler records this verbatim in the
# tenant's customData -- it is an audit breadcrumb, not an authenticated claim.
REQUESTOR="$(az account show --query user.name -o tsv 2>/dev/null || true)"
REQUESTOR="${REQUESTOR:-unknown}"

# Use an isolated kubeconfig so the operator's current kubectl context is never modified.
KUBECONFIG_FILE="$(mktemp -t tenant-admin-kubeconfig.XXXXXX)"
POD_NAME="tenant-admin-$(date +%s)-$RANDOM"
CONFIGMAP_NAME="tenant-admin-src-$POD_NAME"
cleanup() {
  kubectl --kubeconfig "$KUBECONFIG_FILE" -n "$NAMESPACE" delete pod "$POD_NAME" \
    --ignore-not-found --grace-period=1 --wait=false >/dev/null 2>&1 || true
  kubectl --kubeconfig "$KUBECONFIG_FILE" -n "$NAMESPACE" delete configmap "$CONFIGMAP_NAME" --ignore-not-found >/dev/null 2>&1 || true
  rm -f "$KUBECONFIG_FILE"
}
trap cleanup EXIT

az aks get-credentials -g "$RG" -n "$AKS" --overwrite-existing --file "$KUBECONFIG_FILE" >/dev/null
# A function rather than a `K="kubectl ..."` string, so no argument is subject to word splitting.
k() { kubectl --kubeconfig "$KUBECONFIG_FILE" -n "$NAMESPACE" "$@"; }

# Run in the same image the stack runs, so there is nothing extra to build, push or keep in
# sync with the deployed revision.
IMAGE="$(k get deploy fluid-riddler -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"
[ -n "$IMAGE" ] || { echo "ERROR: could not read the routerlicious image from deploy/fluid-riddler." >&2; exit 1; }

# ---------------------------------------------------------------------------
# Rotate safety check: is this tenant's key the one the token service signs with?
#
# The vault name is all that is passed in. The secret itself is read by the CLI from INSIDE the
# cluster, as the workload identity (see the Pod spec below and src/keyVaultClient.js), over the
# vault's private endpoint. Nothing here reaches Key Vault, so the vault's public network access
# stays disabled throughout -- an earlier version of this script flipped it on for the read and
# back afterwards, which briefly exposed the vault to the internet on every rotation.
# ---------------------------------------------------------------------------
KV_ARGS=()
# --force means "rotate without consulting Key Vault at all", so the vault name is not passed and
# the Pod stays out of the workload-identity webhook's way entirely. Without this, --force still
# dragged in the ServiceAccount requirement below, and a missing ServiceAccount produced an error
# telling the operator to pass --force -- which they already had.
FORCE=false
for arg in "${CLI_ARGS[@]}"; do
  case "$arg" in
    --force|--force=true) FORCE=true ;;
  esac
done

if [ "$COMMAND" = "rotate" ] && [ "$FORCE" != "true" ]; then
  KV="$(jqr '.keyVault.name')"
  if [ -n "$KV" ]; then
    KV_ARGS=(--keyvault-name "$KV")
  fi
fi

# ConfigMap keys cannot contain "/", so each file is stored flat and remapped to its real path
# by the volume's items[].path. This keeps the CLI's relative require()s working unchanged.
k create configmap "$CONFIGMAP_NAME" \
  --from-file="$CLI_DIR/bin/tenant-admin.js" \
  --from-file="$CLI_DIR/src/validation.js" \
  --from-file="$CLI_DIR/src/httpClient.js" \
  --from-file="$CLI_DIR/src/riddlerClient.js" \
  --from-file="$CLI_DIR/src/gitrestClient.js" \
  --from-file="$CLI_DIR/src/keyVaultGuard.js" \
  --from-file="$CLI_DIR/src/keyVaultClient.js" \
  --from-file="$CLI_DIR/src/tenantManager.js" \
  --dry-run=client -o yaml | k apply -f - >/dev/null

# The ServiceAccount + label are what let the CLI read Key Vault for the `rotate` check: the AKS
# workload-identity webhook only injects AZURE_CLIENT_ID / AZURE_TENANT_ID /
# AZURE_FEDERATED_TOKEN_FILE into Pods carrying both. This is the same identity every app pod
# uses, and it holds "Key Vault Secrets User" on the vault (azure/deploy.sh phase8_keyvault).
# Being in the VNet is what makes the vault's private endpoint resolvable at all.
#
# Attached ONLY when the Key Vault check is actually going to run. That webhook is registered
# with objectSelector azure.workload.identity/use=true and failurePolicy=Fail, so the label makes
# Pod creation depend on the webhook being reachable -- if its pods are down or stranded on a
# NotReady node, every labelled Pod is rejected with "failed calling webhook
# mutation.azure-workload-identity.io ... 502". Labelling unconditionally would take out `list`,
# `get`, `create` and `delete`, none of which touch Key Vault.
WORKLOAD_SA=""
if [ "${#KV_ARGS[@]}" -gt 0 ]; then
  WORKLOAD_SA="fluid-workload-identity"
  if ! k get serviceaccount "$WORKLOAD_SA" >/dev/null 2>&1; then
    echo "ERROR: ServiceAccount '$WORKLOAD_SA' not found in namespace '$NAMESPACE', so the Pod" >&2
    echo "       cannot read Key Vault to check whether this key is in use. Re-run azure/deploy.sh" >&2
    echo "       (phase4_secrets_infra), or pass --force to skip the check." >&2
    exit 1
  fi
fi

# The Pod's primary process never receives or prints a tenant key. The CLI is run below through
# `kubectl exec`, whose stdout is streamed directly to this requesting terminal and is not part of
# the container's stdout/stderr log stream. Using a completed Pod plus `kubectl logs` here would
# copy every create/get-key/rotate result into the node log and any cluster log collector.
overrides="$(jq -n --arg name "$POD_NAME" --arg image "$IMAGE" --arg cm "$CONFIGMAP_NAME" \
  --arg sa "$WORKLOAD_SA" '{
  spec: ({
    restartPolicy: "Never",
    terminationGracePeriodSeconds: 1,
    containers: [{
      name: $name,
      image: $image,
      command: ["sh", "-c", "sleep 900"],
      volumeMounts: [{ name: "src", mountPath: "/app" }]
    }],
    volumes: [{
      name: "src",
      configMap: {
        name: $cm,
        items: [
          { key: "tenant-admin.js",   path: "bin/tenant-admin.js" },
          { key: "validation.js",     path: "src/validation.js" },
          { key: "httpClient.js",     path: "src/httpClient.js" },
          { key: "riddlerClient.js",  path: "src/riddlerClient.js" },
          { key: "gitrestClient.js",  path: "src/gitrestClient.js" },
          { key: "keyVaultGuard.js",  path: "src/keyVaultGuard.js" },
          { key: "keyVaultClient.js", path: "src/keyVaultClient.js" },
          { key: "tenantManager.js",  path: "src/tenantManager.js" }
        ]
      }
    }]
  } + (if $sa == "" then {} else { serviceAccountName: $sa } end))
} + (if $sa == "" then {} else { metadata: { labels: { "azure.workload.identity/use": "true" } } } end)')"

k run "$POD_NAME" --image="$IMAGE" --restart=Never --overrides="$overrides" >/dev/null

if ! k wait --for=condition=Ready "pod/$POD_NAME" --timeout=180s >/dev/null; then
  phase="$(k get pod "$POD_NAME" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
  echo "ERROR: tenant-admin Pod did not become ready (phase: ${phase:-unknown})." >&2
  exit 1
fi

# `--json` keeps the exec stream to one machine-readable document. Errors remain on stderr and
# are displayed directly to the requester without being copied through the Pod log.
if ! OUTPUT="$(k exec "$POD_NAME" -- node /app/bin/tenant-admin.js \
  "${CLI_ARGS[@]}" "${KV_ARGS[@]+"${KV_ARGS[@]}"}" \
  --requestor "$REQUESTOR" --json)"; then
  echo "ERROR: tenant-admin command failed." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Output. stdout is the CLI's JSON verbatim, so it composes with jq and still gives the
# requesting user any key they explicitly requested.
#
# Keys are printed for create/rotate: riddler's database is the only place they live, and
# the operator needs the value to configure a token service. `get-key <tenantId>` re-reads it
# later, so nothing is lost if this output is discarded.
# ---------------------------------------------------------------------------
TENANT_ID="$(printf '%s' "$OUTPUT" | jq -r '.tenantId // empty' 2>/dev/null || true)"
printf '%s\n' "$OUTPUT"

case "$COMMAND" in
  create)
    echo "Tenant '$TENANT_ID' created. Point a client at it with tenantId='$TENANT_ID'." >&2
    ;;
  rotate)
    echo "Rotated. Tokens signed with the other key stay valid -- update your token service, then rotate the second key." >&2
    # The CLI runs with --json, so its own notes are suppressed. The outcome of the in-use check
    # travels in the result instead; turn it back into something the operator can act on.
    KV_CHECK="$(printf '%s' "$OUTPUT" | jq -r '.keyVaultCheck // empty' 2>/dev/null || true)"
    KV_NAME="$(printf '%s' "$OUTPUT" | jq -r '.keyVaultName // empty' 2>/dev/null || true)"
    KV_SECRET="$(printf '%s' "$OUTPUT" | jq -r '.keyVaultSecretName // empty' 2>/dev/null || true)"
    case "$KV_CHECK" in
      performed)
        echo "Write the new key into Key Vault so the token service picks it up:" >&2
        echo "  az keyvault secret set --vault-name $KV_NAME --name $KV_SECRET --value <the new key>" >&2
        ;;
      skipped-no-secret)
        echo "In-use key check: no secret '$KV_SECRET' in Key Vault '$KV_NAME' -- no token service uses this tenant's key." >&2
        ;;
      skipped-no-vault)
        echo "In-use key check: SKIPPED (keyVault.name is not set in $PARAMS_FILE)." >&2
        ;;
      skipped-forced)
        echo "In-use key check: SKIPPED because --force was given. If this key was in use, token minting is broken until you update Key Vault." >&2
        ;;
    esac
    echo "Re-read either key at any time with: tenant-admin/tenant-admin.sh get-key $TENANT_ID" >&2
    ;;
  delete)
    echo "The gitrest repository for '$TENANT_ID' still exists; gitrest has no delete route." >&2
    ;;
esac
