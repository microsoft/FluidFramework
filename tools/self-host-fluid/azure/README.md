# Azure deployment — Routerlicious + Redpanda on AKS

Deploy the full-stack self-host Fluid service to Azure Kubernetes Service (AKS), with images
**built from source and pushed to ACR**. The published images evaluated during this project
did not match the source revision and service topology validated by this runbook. The selected
architecture uses Redpanda as the broker and in-cluster reference backends. Durable snapshot
storage is an **Azure Files PV**; Mongo and Redis run in-cluster (managed alternatives are noted
under hardening).

> **Honest status.** This is a validated **reference deployment**, not a one-command product
> or production-ready service. Phases 0–6 were run, and a real Fluid client completed
> connect, create/attach, real-time sync, second-client cold-load/convergence, and audience
> presence. Production auth, TLS/DNS, high availability, backup/restore, and the known
> incremental-summary issue remain open.

## How this deployment is packaged

This repository documents a reusable deployment, not one captured Azure environment. Customer
subscription IDs, live resource names, endpoint addresses, tenant keys, and generated AKS node
resources do not belong in source control.

| Artifact | Responsibility |
| --- | --- |
| This runbook | Creates the Azure resource group, ACR, AKS, registry access, topics, and public reference endpoints |
| [`redpanda.yaml`](./redpanda.yaml) | Single-node Redpanda, managed-disk PVC, and internal Kafka service |
| [`backends.yaml`](./backends.yaml) | Redis, MongoDB, Azure Files snapshot storage, gitrest, and historian |
| [`routerlicious-values.yaml`](./routerlicious-values.yaml) | Full Routerlicious Helm configuration and service wiring; rendered to a temporary deployment copy before use |
| [`../token-function`](../token-function) | Unfinished token prototype; not the validated or production auth path |

The validated automation boundary is **Azure CLI + Kubernetes manifests + Helm**. This repository
does not currently deliver a generic ARM/Bicep module. An exported template from one live resource
group is an environment record, not automatically reusable infrastructure as code. If a receiving
team adds IaC, parameterize the customer-owned resource group, ACR, AKS, identities, and networking;
continue to let AKS create and own its generated `MC_...` node resource group.

## Topology

| Component | Runs as | Storage |
| --- | --- | --- |
| alfred / nexus / deli / scriptorium / scribe / riddler | Helm chart (routerlicious) | — |
| Redpanda (broker) | `redpanda.yaml` | managed-disk PVC; single replica, no HA |
| gitrest + historian + redis + mongo | `backends.yaml` (in-cluster) | gitrest → **Azure Files PV**; mongo → managed-disk PV |
| Client token minting | Trusted customer backend required for production; unfinished Azure Function prototype included for reference | protected tenant key |

## Azure resource ownership

| Boundary | Created or managed here | Ownership rule |
| --- | --- | --- |
| Customer resource group | ACR and AKS managed cluster | Customer creates, names, secures, monitors, and deletes these resources |
| AKS-managed node resource group (`MC_<rg>_<aks>_<region>`) | VM scale sets, VNet/NSG, load balancer, public IPs, managed identities, CSI-created disks and storage accounts | AKS creates and reconciles this group; do not deploy or edit it as an independent stack |
| Kubernetes namespace | Routerlicious, Redpanda, MongoDB, Redis, historian, gitrest, Services, Secrets, and PVCs | Customer operates the workloads and protects their configuration and credentials |
| Durable state | Mongo managed disk, Redpanda managed disk, and gitrest Azure Files share | Customer owns retention, backup, restore, locks, and teardown decisions |

Exact generated resource names and counts vary by region, AKS version, networking mode, node
configuration, CSI driver behavior, and the number of exposed LoadBalancer services. Treat Azure's
generated resources as implementation detail; verify the customer-visible contracts instead.

## Prerequisites

- Run the commands below in **Bash** (Git Bash, WSL, macOS, or Linux).
- `az`, `kubectl`, `helm`, `openssl`, and **Docker with buildx** installed; `az login` done.
- An Azure subscription you can create resources in (this costs money).
- A local [FluidFramework](https://github.com/microsoft/FluidFramework) checkout — the Helm
  chart is at `$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious`, and images build from
  its `server/*` Dockerfiles.
- The local stack working first (`../README.md`).

Start in the **selfhost-fluid repository root** and set the deployment inputs. `ACR` is the short,
globally unique Azure resource name without `.azurecr.io`. The three locations may be the same;
they are separate variables so customers can follow their own placement policy.

```bash
SELFHOST_ROOT="$PWD"
FLUID_ROOT=/absolute/path/to/FluidFramework
SUB="00000000-0000-0000-0000-000000000000"
RG="my-fluid-rg"; RG_LOC="westus2"
ACR="mygloballyuniqueacr"; ACR_LOC="$RG_LOC"
AKS="my-fluid-aks"; AKS_LOC="$RG_LOC"

az account set --subscription "$SUB"
az account show --query '{subscription:name,id:id,tenant:tenantId}' -o table
```

| Input | Meaning |
| --- | --- |
| `SUB` | Customer Azure subscription ID |
| `RG` / `RG_LOC` | Customer-owned resource group and its metadata location |
| `ACR` / `ACR_LOC` | Globally unique registry name and image-storage region |
| `AKS` / `AKS_LOC` | Cluster name and workload region |
| `FLUID_ROOT` | Reviewed FluidFramework checkout used for images and Helm chart |
| `IMAGE_TAG` | Unique release tag generated from the reviewed source commit and build time |

## Phase 0 — Resource group + ACR  **[VALIDATED]**

**Creates:** customer resource group and `Microsoft.ContainerRegistry/registries` resource.

Create the registry before attempting to log in or push images:

```bash
az group create -n "$RG" -l "$RG_LOC"
az acr create -g "$RG" -n "$ACR" -l "$ACR_LOC" --sku Standard --admin-enabled true
```

**VERIFY:** `az acr show -g "$RG" -n "$ACR" --query provisioningState -o tsv` prints
`Succeeded`.

## Phase 1 — Build images to ACR + create AKS  **[VALIDATED]**

**Creates:** three repositories in ACR, the `Microsoft.ContainerService/managedClusters` resource,
its system node pool, and the AKS-owned `MC_...` node resource group.

The server Dockerfiles need BuildKit with a named `root` context (the repo root), which
`az acr build` cannot supply — build with buildx and push:

```bash
az acr login -n "$ACR"
docker buildx create --use --driver docker-container
IMAGE_TAG="$(git -C "$FLUID_ROOT" rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)"
echo "Use this immutable release tag in every manifest: $IMAGE_TAG"
(
  cd "$FLUID_ROOT"
  for svc in routerlicious historian gitrest; do
    docker buildx build --build-context root=. --target runner --platform linux/amd64 \
      -f server/$svc/Dockerfile -t "$ACR.azurecr.io/$svc:$IMAGE_TAG" --push server/$svc
  done
)
```

Never reuse an image tag for different content. Archive the exact FluidFramework commit, local
patch set, tag, and resulting digests with the release. The recorded validation used `v1`; the
unique tag above prevents AKS from silently reusing a cached older image during a new deployment.

After the images are present, create AKS and load its credentials:

```bash
az aks create -g "$RG" -n "$AKS" -l "$AKS_LOC" --node-count 2 --node-vm-size Standard_D4s_v3 \
  --tier free --generate-ssh-keys
az aks get-credentials -g "$RG" -n "$AKS"
```

**VERIFY:** `az acr repository list -n "$ACR"` shows `routerlicious`, `historian`, and
`gitrest`; `kubectl get nodes` shows `Ready`; and `kubectl get storageclass` lists
`azurefile-csi` and `managed-csi`.

## Phase 2 — Image-pull secret  **[VALIDATED]**

**Creates:** Kubernetes `regsecret` and a default-ServiceAccount image-pull reference. It does not
create another Azure resource.

With Contributor-only rights you cannot `--attach-acr`; use a docker-registry secret:

```bash
U=$(az acr credential show -n "$ACR" --query username -o tsv)
P=$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)
kubectl create secret docker-registry regsecret \
  --docker-server="$ACR.azurecr.io" --docker-username="$U" --docker-password="$P"
kubectl patch serviceaccount default -p '{"imagePullSecrets":[{"name":"regsecret"}]}'
```

> **Reference-only registry authentication.** The validated path used the ACR admin credential
> because the available account could not assign the preferred registry integration. Production
> should grant the AKS kubelet identity `AcrPull`, remove this long-lived password secret, rotate
> any exposed credential, and disable the ACR admin account.

## Phase 3 — Redpanda + topics  **[VALIDATED]**

**Creates:** Redpanda Deployment and Service, `redpanda-data` PVC, its CSI-managed disk, and the
`rawdeltas` / `deltas` topics.

Return to the deployment repository before applying its manifests:

```bash
cd "$SELFHOST_ROOT"
kubectl apply -f azure/redpanda.yaml
kubectl wait --for=condition=available deploy/redpanda --timeout=120s
for topic in rawdeltas deltas; do
  kubectl exec deploy/redpanda -- rpk topic describe "$topic" >/dev/null 2>&1 || \
    kubectl exec deploy/redpanda -- rpk topic create "$topic" -p 8 -r 1
done
```

**VERIFY:** run `kubectl exec deploy/redpanda -- rpk topic describe rawdeltas` and the same
command for `deltas`; each topic shows 8 partitions and replication factor 1. Routerlicious's
chart-rendered rdkafka config requests 32 partitions and replication factor 3 when it creates a
missing topic; that cannot succeed on this single-node reference broker. Pre-creating both topics
establishes the validated 8/RF1 configuration before the application tier starts.

## Phase 4 — In-cluster backends (gitrest on Azure Files PV)  **[VALIDATED]**

**Creates:** Azure Files StorageClass and share, Mongo managed-disk PVC, Redis/Mongo/gitrest/
historian Deployments, and internal Services.

Render deployment copies outside the Git checkout so live values are not committed:

```bash
DEPLOY_DIR="${TMPDIR:-/tmp}/selfhost-fluid-$AKS"
mkdir -p "$DEPLOY_DIR"
sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" \
  azure/backends.yaml > "$DEPLOY_DIR/backends.yaml"
sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" \
  azure/routerlicious-values.yaml > "$DEPLOY_DIR/routerlicious-values.yaml"

kubectl apply -f "$DEPLOY_DIR/backends.yaml"
kubectl wait --for=condition=available deploy/redis deploy/mongo deploy/gitrest deploy/historian --timeout=300s
```

**VERIFY:** `kubectl get pods` shows redis/mongo/gitrest/historian `Running`, and
`kubectl get pvc gitrest-data` is **`Bound`** (RWX, `azurefile-gitrest`). gitrest snapshots
live on **Azure Files** — there is no Blob backend (see hardening).

## Phase 5 — Deploy Routerlicious (Helm)  **[VALIDATED]**

**Creates:** Helm release `fluid`; alfred, nexus, deli, scriptorium, scribe, and riddler
Deployments/Services; one application ConfigMap; and alfred/nexus Ingress objects. The historian
backend resolves this release's `fluid-riddler` service. The values assign the Ingress objects to
`selfhost-reference-disabled`, a class that must have no controller in the reference cluster;
Phase 6 uses explicit LoadBalancer Services instead.

```bash
key=$(openssl rand -hex 32)   # strong tenant key; reuse it for the token endpoint
helm install fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" \
  -f "$DEPLOY_DIR/routerlicious-values.yaml" \
  --set-string "alfred.key=$key"  --set-string "nexus.key=$key" \
  --set-string "alfred.tenants[0].key=$key" --set-string "nexus.tenants[0].key=$key" \
  --set-string "riddler.tenants[0].key=$key"
```

**VERIFY:** the alfred/nexus/deli/scriptorium/scribe/riddler pods reach `Running` with no
crash loop.

> **Reference-only secret handling.** The upstream chart renders these keys into an ordinary
> ConfigMap, and Helm also retains the values in release metadata; the CLI may expose them in
> shell history. Any identity allowed to read that ConfigMap can recover the key. Do not use this
> chart path for production. Move the key to Key Vault/Kubernetes Secrets or an equivalent
> secret-injection and rotation design, and restrict access to both Helm metadata and workload
> configuration.

**VERIFY:** confirm the reference Ingress class is inactive:

```bash
kubectl get ingress fluid-alfred fluid-nexus -o custom-columns=NAME:.metadata.name,CLASS:.spec.ingressClassName
if kubectl get ingressclass selfhost-reference-disabled >/dev/null 2>&1; then
  echo "ERROR: selfhost-reference-disabled must not have an installed controller"
  exit 1
fi
```

## Phase 6 — Expose + client validation  **[VALIDATED]**

**Creates:** three Kubernetes LoadBalancer Services. Azure then creates the corresponding public
IPs and load-balancer rules in the AKS-managed node resource group.

The full-stack endpoints are **separate**: REST = alfred, websocket = nexus, storage =
historian. The target ports are not the same: alfred and nexus use the chart's named `ui`
port; historian listens on `3000`.

```bash
kubectl expose deploy/fluid-alfred --name fluid-alfred-public \
  --type LoadBalancer --port 80 --target-port ui
kubectl expose deploy/fluid-nexus --name fluid-nexus-public \
  --type LoadBalancer --port 80 --target-port ui
kubectl expose deploy/historian --name historian-public \
  --type LoadBalancer --port 80 --target-port 3000
kubectl get svc fluid-alfred-public fluid-nexus-public historian-public --watch
```

Do not omit `--target-port`: the default target of port 80 times out. Configure the client's
alfred, nexus, and historian URLs with the assigned addresses. The validated client path supplied
all three endpoints directly.

The referenced chart maps `alfred.externalUrl` and `historian.externalUrl` into discovery but does
not map `nexus.externalUrl` to Routerlicious's `worker.deltaStreamUrl`; without that field,
discovery advertises the alfred URL for both ordering and delta-stream traffic. Do not enable
discovery for these separate LoadBalancers until the chart emits an externally reachable
`worker.deltaStreamUrl` and the flow is retested. A unified ingress that routes REST to alfred and
socket.io to nexus is another production design, but was not delivered here.

If only the advertised alfred and historian URLs must be updated after the LoadBalancers exist,
preserve the installed tenant keys by using `--reuse-values` **without** reapplying the values file:

```bash
helm upgrade fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" --reuse-values \
  --set-string "alfred.host=<ALFRED_HOST>" \
  --set-string "alfred.externalUrl=http://<ALFRED_HOST>" \
  --set-string "historian.externalUrl=http://<HISTORIAN_HOST>"
```

Do not pass `azure/routerlicious-values.yaml` in this endpoint-only upgrade because it contains
`PLACEHOLDER_KEY`; reapplying it would replace the installed tenant keys. Keep live addresses and
credentials out of source control.

**VERIFY:** alfred and historian `/healthz/startup` return HTTP 200; the nexus socket.io
handshake succeeds; then use two clients to create/attach a document, exchange real-time
ops, cold-load and converge on the existing document, and confirm both clients appear in the
audience. This scenario was completed on the reference deployment. It used HTTP and
`InsecureTokenProvider`; it did not validate production security or load capacity.

## Phase 7 — Client token function (Azure Function)  **[OPEN]**

**Delivered state:** no production token resource is created by this runbook.

`../token-function` signs client JWTs with the tenant key. Connecting/publishing it is the
step that was not completed successfully during validation; the root cause was not
established. The validated path instead used `InsecureTokenProvider` for development. A
production deployment needs a trusted backend that authenticates and authorizes callers,
then signs short-lived tokens without exposing the tenant key.

---

## Status summary

Here, **[VALIDATED]** means the phase was performed successfully before the validation cutoff;
it does not mean that immutable image digests and a complete deployment-output archive were
retained. See [the validation record](../VALIDATION.md) for the evidence boundary.

| Phase | State |
| --- | --- |
| 0 Resource group + ACR | [VALIDATED] |
| 1 Build images → ACR + create AKS | [VALIDATED] |
| 2 Image-pull secret | [VALIDATED] |
| 3 Redpanda + topics | [VALIDATED] |
| 4 In-cluster backends (gitrest on Azure Files PV) | [VALIDATED] |
| 5 Helm routerlicious | [VALIDATED] |
| 6 Expose + real-client collaboration | [VALIDATED] — HTTP/dev auth reference path |
| 7 Token Azure Function | [OPEN] — prototype not connected or validated |

## Post-deployment inventory

Record the deployment without committing live identifiers or secrets:

```bash
az group show -n "$RG" --query '{name:name,location:location,state:properties.provisioningState}' -o table
az resource list -g "$RG" --query '[].{type:type,name:name,location:location}' -o table
az aks show -g "$RG" -n "$AKS" --query '{cluster:name,nodeResourceGroup:nodeResourceGroup,kubernetesVersion:kubernetesVersion,state:provisioningState}' -o table
kubectl get deploy,svc,pvc,configmap,ingress
kubectl get storageclass
kubectl exec deploy/redpanda -- rpk topic describe rawdeltas
kubectl exec deploy/redpanda -- rpk topic describe deltas
```

The `MC_...` group is an AKS-generated implementation record. It can be inspected with
`az resource list -g <node-resource-group>`, but it must not become a separately deployed template
or a second source of truth.

## Production hardening (beyond this runbook)

- **TLS and DNS:** replace public HTTP LoadBalancers with HTTPS/WSS endpoints, certificates,
  and an owned domain/renewal process.
- **Production auth and secrets:** replace `InsecureTokenProvider`; authenticate users and
  authorize tenant/document access in a trusted backend; keep tenant keys in a secret store
  with rotation. The reference Helm CLI key flow is not production-safe.
- **Registry authentication:** grant the AKS kubelet identity `AcrPull` (or use an equivalent
  controlled identity path), remove the ACR admin-password secret, disable the admin account,
  and define credential rotation.
- **Incremental summaries:** investigate the observed `404 Summary tree handle object not
  found` from incremental-summary upload. The delivered values explicitly retain the chart's
  validated `storage.enableWholeSummaryUpload: false` mode; the local Routerlicious default used
  during earlier work was different. Do not flip the setting without matching client/server
  assumptions and rerunning repeated-summary, op-growth, restart, and cold-load checks.
- **Broker durability and HA:** the PVC-backed single-node Redpanda retained topics across a
  pod restart. That proves restart persistence only. Production needs a replicated broker,
  an appropriate replication factor, failure testing, backup/restore, and an ownership
  decision (managed service versus operated in-cluster).
- **Snapshots on Azure Blob:** gitrest has **no Blob backend in OSS** (only local-fs / mem /
  redis). Azure Files (this runbook) is the zero-code managed option; Blob (a common managed-service storage model)
  requires **writing a new `IFileSystemManager` adapter**.
- **MongoDB:** the reference manifest preserves the historically validated `mongo:4` pin and
  has no authentication or TLS. Select a currently supported MongoDB-compatible topology, such
  as Cosmos DB for MongoDB (vCore), then set `mongodb.operationsDbEndpoint`, use
  `directConnection: false` where required, and validate compatibility, authentication, TLS,
  backup/restore, and failover before production.
- **Managed Redis-compatible service:** replace the in-cluster no-auth Redis with a currently
  supported authenticated/TLS service. Wire the required host, port, TLS, and credential fields
  into the Routerlicious Helm values and the raw gitrest/historian Deployments, then validate
  client compatibility and recovery behavior.
- **Image pinning:** pin every application and infrastructure image by a unique immutable tag or
  digest, including Redpanda, MongoDB, Redis, and proxy images; retain a tested rollback set.
- **Storage ownership:** decide whether the AKS-provisioned Azure Files and managed disks may
  remain associated with cluster-managed resources or must move under a separately managed
  storage lifecycle and backup owner.
- **Operations:** add resource sizing, multiple replicas where supported, PDBs, monitoring,
  alerts, SLOs, upgrade/rollback procedures, and tested backup/restore.

## Stop and cleanup

- Stop compute while retaining configuration and PVC data: `az aks stop -g "$RG" -n "$AKS"`.
- Resume: `az aks start -g "$RG" -n "$AKS"` and re-run the phase VERIFY steps.
- Public LoadBalancers and retained disks can continue to incur cost. Delete them explicitly
  when no longer needed; inspect retained PVs before deleting the resource group.
- Do not treat a retained PVC as a backup. Define and test MongoDB, gitrest snapshot, and
  broker recovery before production use.
- Deleting the AKS cluster normally deletes its AKS-managed `MC_...` node resource group. Do not
  delete or recreate that generated group independently. Export or back up customer data before
  deleting the cluster or primary resource group.
