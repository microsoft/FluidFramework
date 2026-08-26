# Deploy Fluid to Azure

This directory deploys a complete, self-hosted Fluid service into your own Azure subscription.
You own every resource it creates, in your own resource group.

## What gets deployed

| Component | What it runs on |
| --- | --- |
| Fluid services (alfred, nexus, deli, scribe, scriptorium, riddler) | Azure Kubernetes Service |
| Snapshot storage (gitrest, historian) | AKS + Azure Files |
| Ordering / message log | Azure Event Hubs, over the Kafka protocol |
| Document database | Azure Cosmos DB for MongoDB |
| Cache | Azure Managed Redis |
| Secrets | Azure Key Vault |
| Container images | Azure Container Registry |
| Public HTTPS endpoints | Azure Front Door |

Every data service (Key Vault, Cosmos DB, Redis, Storage, Event Hubs) is reachable only from
inside the deployment's virtual network through a Private Endpoint — none of them are exposed to
the public internet. Only Front Door is public.

**This costs money.** It provisions managed Azure services that bill continuously. See
[Removing the deployment](#removing-the-deployment) when you are finished.

## Before you start

**1. Install the tools.**

| Tool | Needed for | Notes |
| --- | --- | --- |
| `az` | everything | Azure CLI, signed in |
| `kubectl` | talking to the cluster | |
| `helm` | installing the Fluid services | Helm 3 |
| `docker` | building images | The daemon must be **running**, and `docker buildx` must work |
| `jq` | reading your configuration file | |
| `python3` | rendering configuration | |
| `curl` | health checks during deployment | |
| `openssl` | generating the tenant key | |
| `git` | checking out the pinned source revision | |
| `node` + `npm` | the end-to-end check in Step 4 only | Node 18 or newer |

`deploy.sh` verifies all of these except `node`/`npm` before it does anything, and stops with a
list of what is missing. `node` and `npm` are only needed if you run `deploy-validate` in Step 4.

Confirm Docker is actually running before you start — an installed-but-stopped Docker passes the
tool check and then fails partway through the image build:

```bash
docker buildx version
```

Run everything from **Bash** — Git Bash, WSL, macOS, or Linux. Zsh and PowerShell will not work.

**Run every command in this guide from the `tools/selfhost` directory**, not the FluidFramework repository root:

```bash
cd tools/selfhost
```

All paths below are relative to it.

**2. Sign in to Azure** and select the subscription you want to deploy into:

```bash
az login
az account set --subscription <your-subscription-id>
```

You need to be able to **create resources and assign roles** in that subscription. Assigning roles
means `Owner`, or `Contributor` plus `User Access Administrator` — plain `Contributor` is not
enough, because the deployment grants the cluster's managed identity access to Key Vault and ACR.

You also need enough **vCPU quota** in your chosen region for the AKS nodes: roughly
`(aks.systemNodeMaxCount + 1) × 8` vCPUs with the default VM size. Preflight checks this for you.

**3. Get a FluidFramework checkout.** The deployment builds container images from source, so it
needs a local clone:

```bash
git clone https://github.com/microsoft/FluidFramework.git ~/FluidFramework
```

Use a checkout you are happy to have moved to an arbitrary commit — the deployment checks out a
specific pinned revision in this directory. Do not point it at a clone you are actively working in.

**4. Have a release bundle.** A release bundle pins exactly which source revision and which image
digests get deployed, so the same bundle always produces the same deployment. It lives in
`release-artifacts/<release-id>/`. See [`release/README.md`](../release/README.md) to create one.
The deployment refuses to run without a bundle, and refuses one whose images are not all pinned.

### Things that commonly go wrong

None of these are checked for you. Each one is cheap to rule out now and annoying to hit
mid-deployment.

**Register the Azure resource providers.** On a subscription that has never used these services,
the first attempt to create one fails with `MissingSubscriptionRegistration`. Preflight does not
check this. Register them once — it is idempotent, so it is safe to run even if some are already
registered:

```bash
for p in Microsoft.ContainerService Microsoft.ContainerRegistry Microsoft.KeyVault \
         Microsoft.DocumentDB Microsoft.Cache Microsoft.Storage Microsoft.EventHub \
         Microsoft.Cdn Microsoft.Network Microsoft.ManagedIdentity; do
  az provider register --namespace "$p"
done
```

Registration is asynchronous. Check it finished with
`az provider show --namespace Microsoft.EventHub --query registrationState -o tsv`.

**Check whether Azure Policy will block you.** Managed subscriptions often carry policies that
deny resources with local/key-based authentication, deny public network access, or require
specific tags. This deployment uses a connection string for Event Hubs and for Cosmos DB, which
is exactly the shape such policies target. A denial appears as `RequestDisallowedByPolicy` naming
the policy. If your subscription is centrally governed, confirm with whoever owns its policy
assignments before you start rather than after a half-built deployment.

**Run it somewhere that will not go to sleep.** A first deployment runs for a long time — image
builds, AKS, Cosmos and Redis provisioning, and Front Door DNS propagation are all slow. If your
laptop suspends or the SSH session drops partway, the script stops where it was. It is safe to
re-run, but you will wait again. Use `tmux`/`screen` for a remote session, and on macOS prefix the
command with `caffeinate -i` to stop the machine sleeping.

**Front Door propagation is the most likely late failure.** The final step polls the three
endpoints until they answer, and gives up after 20 attempts. DNS propagation occasionally takes
longer than that budget, which fails the deployment right at the end even though everything was
created correctly. If that happens, re-run — the resources already exist, so it will skip straight
to re-checking.

**Regional capacity is not guaranteed.** Azure Managed Redis Balanced SKUs, and the VM size for
your AKS nodes, can both fail with `AllocationFailed` in a region that is temporarily full. This
is unrelated to your quota. If it happens, try another region, or a different VM size.

**Check your network range before you deploy.** The default VNet is `10.20.0.0/16`. If you intend
to peer this deployment with an existing network, make sure that range does not overlap, because
changing it later means rebuilding the VNet and everything attached to it.

**Budget for the running cost.** This provisions AKS nodes, Azure Managed Redis, provisioned-throughput
Cosmos DB, Event Hubs, and Front Door — all billing continuously from the moment they exist, not
just while you are using them. Price your specific configuration with the
[Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) before deploying, and
see [Pausing to save cost](#pausing-to-save-cost) and
[Removing the deployment](#removing-the-deployment).

## Step 1 — Create your configuration file

Everything you customize lives in one JSON file. Copy the template:

```bash
cp azure/deploy.parameters.example.json azure/deploy.parameters.json
```

`azure/deploy.parameters.json` is gitignored, so it will never be committed.

> **Never put secrets in this file.** It holds names, sizes, regions and counts only. Passwords,
> connection strings and keys are generated during deployment and stored in Key Vault.

### The values you must change

These have no sensible default. The deployment will not work until you set them:

| Setting | What to put | Rules |
| --- | --- | --- |
| `subscriptionId` | Your Azure subscription GUID | From `az account show --query id -o tsv` |
| `resourceGroup` | Name for the resource group to create | Any name not already in use |
| `location` | Azure region, e.g. `eastus2` | Must support Availability Zones — see below |
| `fluidRepoDir` | Absolute path to your FluidFramework clone | Must already exist |

### The names that must be globally unique

These become part of a public DNS name, so **no one else in Azure can already be using them**.
Add a suffix such as your team name or a number. Preflight checks every one of these before
anything is created, so you find out immediately rather than halfway through.

| Setting | Length | Allowed characters |
| --- | --- | --- |
| `buildAcr.name` | 5–50 | lowercase letters and numbers only |
| `deployAcr.name` | 5–50 | lowercase letters and numbers only |
| `keyVault.name` | 3–24 | letters, numbers, hyphens |
| `cosmos.clusterName` | 3–40 | lowercase letters, numbers, hyphens |
| `redis.clusterName` | 1–63 | letters, numbers, hyphens |
| `storage.accountName` | 3–24 | lowercase letters and numbers only |
| `kafka.eventHubs.namespaceName` | 6–50 | letters, numbers, hyphens |
| `frontDoor.profileName` | 1–260 | letters, numbers, hyphens |

There are two container registries on purpose: `buildAcr` holds intermediate build layers, and
`deployAcr` holds the images your cluster actually pulls. Keeping them apart means the cluster's
registry never needs build credentials. **They must be different names** — validation rejects the
two being set to the same registry.

### Choosing a region

Pick a region that supports **Availability Zones**. Three settings depend on it —
`aks.availabilityZones`, `redis.zones`, and `kafka.eventHubs.zoneRedundant` — and they spread
your deployment across physically separate datacenters so a single one failing does not take the
service down.

`kafka.eventHubs.zoneRedundant` **can only be set when the namespace is created.** Changing your
mind later means deleting and rebuilding it. Preflight checks your region for zone support before
anything else is provisioned, precisely because this mistake is expensive to undo.

If you must use a region without zones, set `kafka.eventHubs.zoneRedundant` to `false`,
`aks.availabilityZones` to `[]`, and `redis.zones` to `[]`.

### Sizing and cost

Defaults are a validated production-shaped starting point, not a minimum. These are the settings
that drive most of the bill:

| Setting | Default | What it means |
| --- | --- | --- |
| `aks.systemNodeVmSize` | `Standard_D8as_v5` | 8 vCPU per node |
| `aks.systemNodeMinCount` / `MaxCount` | 3 / 10 | Autoscaling range. You need quota for `(max + 1) × 8` vCPUs |
| `cosmos.throughput.*` | 4,000–80,000 RU/s | Per-collection database capacity. `deltas` and `documents` are the large ones |
| `redis.sku` / `vmSize` | `Premium` / `p1` | Premium is required for zone redundancy |
| `storage.gitrestQuota` | `20Ti` | Provisioned file-share size |
| `kafka.eventHubs.capacity` | `4` | Event Hubs throughput units — see below |

For a small evaluation you can reduce `aks.systemNodeMaxCount`, lower the `cosmos.throughput`
values, and drop `storage.gitrestQuota`. Preflight verifies you actually have the vCPU quota for
your node settings before deploying.

### Event Hubs throughput — the setting most worth understanding

One throughput unit (TU) allows **1 MB/s or 1,000 events per second, whichever limit you reach
first.** The event-rate limit is usually the one that bites: a workload can sit at half the byte
allowance and still be throttled on event count.

This matters more than a normal capacity setting because of what throttling does here. A
throttled send does not fail quickly — it retries for up to 120 seconds, and that timeout is
treated as fatal, so the service restarts. Under-provisioning shows up as services restarting,
not as a tidy "throttled" error.

The default is `capacity: 4` with `autoInflate: true` up to `maxThroughputUnits: 10`, so it
starts with real headroom and grows automatically under load. Capacity can be raised on a live
namespace at any time; leave auto-inflate on unless you have a reason to cap spend hard.

### Optional settings

You can leave these alone. Every one has a working default:

- **`microservices`** — replica counts per service. `alfred`, `nexus`, `riddler` and `historian`
  autoscale between `minReplicas` and `maxReplicas`. `deli`, `scribe` and `scriptorium` use fixed
  replicas deliberately: they are Kafka consumer-group members, and adding or removing one forces
  every other replica to pause and rebalance. `gitrest` is always exactly 1 replica and cannot be
  changed.
- **`network`** — VNet address ranges. Change these only if `10.20.0.0/16` collides with a network
  you intend to peer with.
- **`workloadIdentity`** — the managed identity your pods use to read Key Vault. Defaults to
  `<aks-name>-workload-identity`.
- **`tokenService`** — an optional reference token service. It is **not** deployed by the main
  script. See [`token-service/README.md`](../token-service/README.md).

## Step 2 — Check your configuration before deploying

Two checks, both cheap. Run them in this order.

**Validate the scripts — no Azure account needed, runs in seconds:**

```bash
bash azure/test/deploy.test.sh
```

Expect `Total: 63 passed, 0 failed`. This runs the real deployment logic against stub tools, so
nothing reaches Azure and nothing costs anything. Run it after editing any file in this directory.

**Validate your parameters against Azure — read-only, creates nothing:**

```bash
bash azure/preflight-check.sh azure/deploy.parameters.json
```

This confirms you are signed in, your subscription has enough vCPU quota for your node settings,
every globally-unique name is actually available, and your region supports Availability Zones.

The deployment runs this automatically and refuses to start if it fails — but running it yourself
while you are still editing the file is much faster than discovering a name collision mid-deploy.

## Step 3 — Deploy

There are two ways. They create identical resources in the identical order.

| | Choose this when |
| --- | --- |
| **[All at once](#all-at-once)** | You want the service running. This is the normal path. |
| **[Step by step](#step-by-step)** | You want to inspect each resource as it appears, or a phase failed and you want to re-run just that one. |

### All at once

```bash
./azure/deploy.sh <release-id>
```

To use a parameters file somewhere else:

```bash
./azure/deploy.sh <release-id> path/to/my-params.json
```

Then wait. A first deployment takes a while — building images, provisioning AKS, Cosmos and
Redis, and waiting for Front Door DNS to propagate all take real time. Progress is printed as it
goes and written to:

```
${TMPDIR:-/tmp}/selfhost-fluid-<aks-name>/deploy-<timestamp>.log
```

When it finishes it prints your three public endpoints.

**If it fails partway, just run it again.** Every phase checks whether its resource already
exists before creating it, so re-running skips completed work and resumes where it stopped.

### Step by step

Same phases, run one at a time, so you can inspect each resource before continuing.

First extract the phases into a file you can load. This strips the part of `deploy.sh` that runs
the deployment, keeping only the phase definitions:

```bash
sed '/^# Main$/,$d' azure/deploy.sh > /tmp/fluid-phases.sh
```

Now run whichever phases you want inside a single `bash -c` block. Loading the file works out
every resource name and runs the read-only preflight checks first, then stops — it deploys
nothing on its own:

```bash
bash -c '
  source /tmp/fluid-phases.sh <release-id> azure/deploy.parameters.json

  phase0_rg_acr                  # resource group + both container registries
  phase0_network                 # VNet, subnets, private DNS zones
  phase0_network_allow_frontdoor # network rules for Front Door
'
```

Inspect what was created, then run the next group the same way:

```bash
bash -c '
  source /tmp/fluid-phases.sh <release-id> azure/deploy.parameters.json

  phase1_images                  # build images from source, push to ACR
  phase1_aks                     # the Kubernetes cluster
  phase1_gitrest_nodepool        # dedicated node pool for gitrest
  phase2_acr_harden              # switch image pulls to managed identity
'
```

The remaining phases, in order:

```bash
  phase8_workload_identity       # the managed identity pods use for Key Vault
  phase8_keyvault                # Key Vault
  phase8_cosmos                  # Cosmos DB for MongoDB
  phase8_redis                   # Azure Managed Redis
  phase8_storage                 # Storage account for snapshots

  phase3_eventhubs               # Event Hubs namespace, hubs, private endpoint
  phase8_keyvault_lockdown       # close Key Vault to the public internet

  phase4_secrets_infra           # ServiceAccount + secret mounting
  phase4_backends                # gitrest and historian
  phase5_helm                    # the Fluid services themselves
  phase5_bootstrap_tenant        # create the default tenant
  phase6_expose                  # load balancers
  phase10_hpa                    # autoscaling rules
  phase12_frontdoor              # public HTTPS endpoints
  phase12_restrict_origin_nsg    # lock origins to Front Door only
```

> **Use `bash -c` rather than sourcing the file directly into your shell.** `deploy.sh` runs under
> `set -euo pipefail` and exits on any bad precondition. Loaded straight into your own shell,
> those settings become your shell's settings and an `exit` closes your terminal. The `bash -c`
> block keeps all of that inside a throwaway subshell.

Two ordering rules matter, and both are load-bearing:

- **`phase3_eventhubs` must run before `phase8_keyvault_lockdown`.** It writes the Event Hubs
  connection string into Key Vault, and it can only do that while Key Vault is still reachable
  from your machine. Run them the other way round and it fails.
- **`phase0_*` and `phase1_*` come before everything else.** Later phases need the network and
  cluster to exist.

Any phase can be re-run safely. If one fails, fix the cause and call it again — it will skip work
that already succeeded.

## Step 4 — Check it works

The deployment prints three endpoints when it finishes. To fetch them again later:

```bash
az afd endpoint list -g <your-resource-group> --profile-name <your-frontdoor-profile> \
  --query "[].{name:name, host:hostName}" -o table
```

Confirm every pod is running:

```bash
az aks get-credentials -g <your-resource-group> -n <your-aks-name>
kubectl get pods
```

Then run the end-to-end check, which connects two real Fluid clients and verifies they sync:

```bash
bash deploy-validate/deploy-validate.sh
```

See [`deploy-validate/README.md`](../deploy-validate/README.md).

## Updating an existing deployment

To deploy a newer release onto infrastructure that already exists, skipping all the Azure
provisioning:

```bash
./azure/deploy.sh --deploy-only <release-id>
```

This rebuilds and redeploys the application only. It does not touch Cosmos, Redis, Event Hubs,
Key Vault or Front Door.

## Removing the deployment

Everything lives in one resource group, so deleting it removes all of it:

```bash
az group delete --name <your-resource-group> --yes
```

**This deletes your data**, including all documents and snapshots. There is no undo.

Key Vault is soft-deleted rather than destroyed, so its name stays reserved for 90 days. To reuse
the same name sooner:

```bash
az keyvault purge --name <your-keyvault-name>
```

## Reference: what each phase creates

The rest of this document describes every phase in detail — the exact resources, the commands
behind them, and how to verify each one by hand. You do not need it for a normal deployment; it
is here for customizing a phase, or diagnosing one that failed. Each phase has its own **VERIFY**
step — when running phases by hand, do not move on until VERIFY passes.

### How this deployment is packaged

This repository documents a reusable deployment, not one captured Azure environment. Customer
subscription IDs, live resource names, endpoint addresses, tenant keys, and generated AKS node
resources do not belong in source control.

| Artifact | Responsibility |
| --- | --- |
| This runbook | Creates the Azure resource group, ACR, AKS, registry access, topics, and public reference endpoints |
| [`backends.yaml`](./backends.yaml) | Azure Files snapshot storage, gitrest, and historian (Redis and MongoDB are managed services provisioned by this runbook, not in `backends.yaml`) |
| [`routerlicious-values.yaml`](./routerlicious-values.yaml) | Full Routerlicious Helm configuration and service wiring; rendered to a temporary deployment copy before use |

The validated automation boundary is **Azure CLI + Kubernetes manifests + Helm**. This repository
does not currently deliver a generic ARM/Bicep module. An exported template from one live resource
group is an environment record, not automatically reusable infrastructure as code. If a receiving
team adds IaC, parameterize the customer-owned resource group, ACR, AKS, identities, and networking;
continue to let AKS create and own its generated `MC_...` node resource group.

### Topology

| Component | Runs as | Storage |
| --- | --- | --- |
| alfred / nexus / deli / scriptorium / scribe / riddler | Helm chart (routerlicious) | — |
| Event Hubs (broker) | `deploy.sh` `phase3_eventhubs` | Managed PaaS, zone-redundant, private endpoint |
| gitrest + historian | `backends.yaml` (in-cluster) | gitrest → **Azure Files PV** |
| MongoDB (ops/metadata) | Cosmos DB for MongoDB (managed, `phase8_cosmos`) | Cosmos-managed storage, outside the AKS node resource group |
| Redis | Azure Managed Redis (managed, `phase8_redis`) | Cache-managed storage, outside the AKS node resource group |
| Client token minting | Trusted customer backend required for production; unfinished Azure Function prototype included for reference | protected tenant key |

### Azure resource ownership

| Boundary | Created or managed here | Ownership rule |
| --- | --- | --- |
| Customer resource group | ACR and AKS managed cluster | Customer creates, names, secures, monitors, and deletes these resources |
| AKS-managed node resource group (`MC_<rg>_<aks>_<region>`) | VM scale sets, VNet/NSG, load balancer, public IPs, managed identities, CSI-created disks and storage accounts | AKS creates and reconciles this group; do not deploy or edit it as an independent stack |
| Kubernetes namespace | Routerlicious, historian, gitrest, Services, Secrets, and PVCs | Customer operates the workloads and protects their configuration and credentials |
| Durable state | gitrest Azure Files share, Cosmos DB, Azure Managed Redis, and the Event Hubs namespace | Customer owns retention, backup, restore, locks, and teardown decisions. All four are managed services or resources outside the AKS node resource group and survive AKS cluster deletion independently |

Exact generated resource names and counts vary by region, AKS version, networking mode, node
configuration, CSI driver behavior, and the number of exposed LoadBalancer services. Treat Azure's
generated resources as implementation detail; verify the customer-visible contracts instead.

### Prerequisites

- Run the commands below in **Bash** (Git Bash, WSL, macOS, or Linux).
- `az`, `kubectl`, `helm`, `openssl`, and **Docker with buildx** installed; `az login` done.
- An Azure subscription you can create resources in (this costs money).
- A local [FluidFramework](https://github.com/microsoft/FluidFramework) checkout — the Helm
  chart is at `$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious`, and images build from
  its `server/*` Dockerfiles.

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

### Phase execution order

Phase numbers are stable identifiers (cross-referenced elsewhere in this repo), not strict
top-to-bottom reading order — several phases were added or reworked after the original
numbering was fixed, and no longer land in the order they need to run in. **Run them in this
order, not the order they appear in this document:**

**0 → 1 → 2 → 8 → 3 → 4 → 5 → 6 → 10 → 12**

Phase 8 (Key Vault, Cosmos DB, Redis, Storage Account, tenant key) must run before Phase 4
(in-cluster backends) — that phase references resources (`$STORAGE`, `$REDIS`/
`$REDIS_HOSTNAME`, `$KV`) that only exist once Phase 8 has run. Phase 3 (Event Hubs) requires
Phase 8 to have created the Key Vault its connection string is written to. Phase 7 (token
service) is out of scope (customer-operated backend). Event Hubs zone redundancy is set at
namespace create time in Phase 3, so there is no separate broker-placement phase.
`azure/deploy.sh` already runs every phase in this corrected order automatically; this note
only matters if you're following the phases by hand.

> **Identity + network isolation superseded the steps below.** `azure/deploy.sh` now also
> runs a `phase0_network` step (a customer-managed VNet with a dedicated AKS-node subnet and a
> dedicated private-endpoint subnet, passed to `az aks create` via `--vnet-subnet-id`) and a
> `phase8_workload_identity` step (ONE user-assigned managed identity, federated via AAD
> Workload Identity to a single Kubernetes ServiceAccount used by all 8 app workloads — not the
> VM/kubelet-identity or CSI-add-on-identity model described in the Phase 8/5 steps below). The
> VM-managed-identity model needed a manual step — reading the kubelet identity's client ID and
> patching it in as a raw env var — because the node's VMSS had multiple identities attached and
> IMDS couldn't disambiguate them; Workload Identity has no such ambiguity, since its federated
> token is scoped to exactly one identity per ServiceAccount.
> Key Vault, Cosmos DB, Redis, the Storage Account, and the Event Hubs namespace all get a
> Private Endpoint into that VNet and have public network access disabled. **`azure/deploy.sh` is the
> authoritative, currently-accurate source for the exact commands** — the manual steps below
> predate that change and still describe the superseded VM-managed-identity/no-network-
> isolation model; treat them as historical/manual-fallback context, not the current design.

`azure/deploy.sh` is designed to run from the signed-in Azure user's workstation. Key Vault
public network access remains available only while the script performs its data-plane secret
writes and is disabled by the final Key Vault lockdown phase. On a re-run, it is temporarily
re-enabled for those writes. An exit trap restores the disabled state after an interrupted run,
and any `Key Vault Secrets Officer` assignment created for the caller is removed on exit.

### Phase 0 — Resource group + ACR

**Creates:** customer resource group and `Microsoft.ContainerRegistry/registries` resource.

Create the registry before attempting to log in or push images:

```bash
az group create -n "$RG" -l "$RG_LOC"
az acr create -g "$RG" -n "$ACR" -l "$ACR_LOC" --sku Standard --admin-enabled true
```

**VERIFY:** `az acr show -g "$RG" -n "$ACR" --query provisioningState -o tsv` prints
`Succeeded`.

### Phase 1 — Build images to ACR + create AKS

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
  --enable-cluster-autoscaler --min-count 2 --max-count 10 \
  --tier standard --generate-ssh-keys
az aks get-credentials -g "$RG" -n "$AKS"
```

**VERIFY:** `az acr repository list -n "$ACR"` shows `routerlicious`, `historian`, and
`gitrest`; `kubectl get nodes` shows `Ready`; and `kubectl get storageclass` lists
`azurefile-csi` and `managed-csi`.

### Phase 2 — Image-pull secret

**Creates:** an Azure role assignment (`AcrPull` to the kubelet identity). It does not create
a Kubernetes secret or modify the default ServiceAccount.

**Step 1: Grant the AKS kubelet identity `AcrPull`**

```bash
KUBELET_IDENTITY=$(az aks show -g "$RG" -n "$AKS" --query identityProfile.kubeletidentity.objectId -o tsv)
ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
az role assignment create --assignee "$KUBELET_IDENTITY" --role AcrPull --scope "$ACR_ID"
```

Expected: JSON output with `"roleDefinitionName": "AcrPull"`.

**Step 2: Remove the admin-password Secret and disable the admin account**

```bash
kubectl patch serviceaccount default -p '{"imagePullSecrets":null}'
kubectl delete secret regsecret
az acr update -n "$ACR" --admin-enabled false
```

Expected: `az acr update` returns `"adminUserEnabled": false`.

**VERIFY:** Run all of the following:

```bash
kubectl get secret regsecret
```

Expected: `NotFound`.

```bash
az acr show -n "$ACR" --query adminUserEnabled -o tsv
```

Expected: `false`.

Deploy or restart a pod that pulls from `$ACR`:

```bash
kubectl rollout restart deploy/fluid-alfred
kubectl get pods
```

Expected: pods show no `ImagePullBackOff` and image pulls successfully via the kubelet identity
alone.

### Phase 3 — Azure Event Hubs (Kafka-protocol broker)

**Creates:** an Azure Event Hubs namespace (Standard tier, `kafkaEnabled`, auto-inflate off,
zone-redundant, TLS 1.2 minimum) plus two event hubs, `rawdeltas` and `deltas`, at 32 partitions
each with 72-hour retention. Public network access is disabled and a private endpoint
(`privatelink.servicebus.windows.net`) is attached, matching every other PaaS dependency. The
namespace's `RootManageSharedAccessKey` connection string is written to Key Vault as
`eventhub-connection-string`, CSI-mounted into every pod, and exported by the init container as
`kafka__lib__eventHubConnString` — which is what switches `rdkafkaBase.ts` from plaintext to
`SASL_SSL`/`PLAIN` against `<namespace>.servicebus.windows.net:9093`.

Sizing matches the reference production baseline: Standard tier at 1 throughput unit. `capacity`
is a hard ceiling
because auto-inflate is off (1 TU = 1 MB/s or 1000 events/s ingress, 2 MB/s egress,
namespace-wide) but, unlike `zoneRedundant`, it **can** be raised on a live namespace.

```bash
# deploy.sh phase3_eventhubs does this; shown here for the manual path
az eventhubs namespace create -g "$RG" -n "$EVENTHUBS_NAMESPACE" -l "$RG_LOC" \
  --sku Standard --capacity 1 --enable-kafka true --zone-redundant true \
  --enable-auto-inflate false --minimum-tls-version 1.2
for hub in rawdeltas deltas; do
  az eventhubs eventhub create -g "$RG" --namespace-name "$EVENTHUBS_NAMESPACE" -n "$hub" \
    --partition-count 32 --retention-time-in-hours 72 --cleanup-policy Delete
done
```

**VERIFY:** `az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query
"{kafka:kafkaEnabled,zr:zoneRedundant,net:publicNetworkAccess,tier:sku.tier}"` reports
`kafkaEnabled: true`, the configured `zoneRedundant`, `publicNetworkAccess: Disabled`, and a
non-Basic tier; both hubs report `partitionCount: 32`; and the `eventhub-connection-string`
secret exists in Key Vault.

**Note:** `zoneRedundant` is create-time only — it cannot be changed on an existing namespace,
so `preflight-check.sh` checks the region for Availability Zone support before provisioning.

### Phase 4 — In-cluster backends (gitrest on Azure Files PV)

**Requires Phase 8 to have already run** — this phase's manifest references the Storage
Account (`$STORAGE`) and Azure Managed Redis hostname Phase 8 creates; see "Phase execution order"
above. Without Phase 8 having run first, `$STORAGE` and `$REDIS_HOSTNAME` below are undefined.

**Creates:** Azure Files StorageClass (referencing the Phase 8 Storage Account directly by
name — never auto-provisioned into the AKS-managed `MC_...` node resource group),
gitrest/historian Deployments, and internal Services. MongoDB is Cosmos DB (Phase 8), not an
in-cluster resource created here.

Render deployment copies outside the Git checkout so live values are not committed:

```bash
REDIS_HOSTNAME=$(az redisenterprise show --name "$REDIS" --resource-group "$RG" --query hostName -o tsv)
DEPLOY_DIR="${TMPDIR:-/tmp}/selfhost-fluid-$AKS"
mkdir -p "$DEPLOY_DIR"
sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" \
    -e "s|<RG>|$RG|g" -e "s|<STORAGE>|$STORAGE|g" \
    -e "s|<REDIS_HOSTNAME>|$REDIS_HOSTNAME|g" \
  azure/backends.yaml > "$DEPLOY_DIR/backends.yaml"
sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" \
  azure/routerlicious-values.yaml > "$DEPLOY_DIR/routerlicious-values.yaml"

kubectl apply -f "$DEPLOY_DIR/backends.yaml"
kubectl wait --for=condition=available deploy/gitrest deploy/historian --timeout=300s
```

**VERIFY:** `kubectl get pods` shows gitrest/historian `Running`, and
`kubectl get pvc gitrest-data` is **`Bound`** (RWX, `azurefile-gitrest`). gitrest snapshots
live on **Azure Files** — there is no Blob backend (see hardening). Confirm the Storage
Account is not in the node resource group:
`az resource list -g $(az aks show -g "$RG" -n "$AKS" --query nodeResourceGroup -o tsv) --query "[?name=='$STORAGE']"`
returns an empty array.

### Phase 5 — Deploy Routerlicious (Helm)

**Creates:** Helm release `fluid`; alfred, nexus, deli, scriptorium, scribe, and riddler
Deployments/Services; one application ConfigMap; and alfred/nexus Ingress objects. The historian
backend resolves this release's `fluid-riddler` service. The values assign the Ingress objects to
`selfhost-reference-disabled`, a class that must have no controller in the reference cluster;
Phase 6 uses explicit LoadBalancer Services instead.

The Cosmos connection string and Redis access key are mounted from Key Vault via the **Secrets
Store CSI driver** rather than rendered into ConfigMaps or Helm metadata.

> **Client token lifetime is bounded.** Set in `azure/routerlicious-values.yaml` under `auth:` —
> change them there and re-run `deploy.sh`.
>
> `enableTokenExpiration` requires `exp`/`iat` on every token and caps its declared lifetime at
> `maxTokenLifetimeSec`. With it false, a token with no `exp`, or one claiming a 10-year
> lifetime, is accepted. (Tokens that do carry `exp` expire either way — `jwt.verify` enforces
> that.)
>
> The upstream chart writes both into its ConfigMap as literals rather than Helm values, so a
> values file has nothing to override. `phase5_helm` rewrites those two lines in the chart
> template to read from `auth:`, once per checkout; that is the only reason the patch exists.

**Check:** after Phase 5,

```bash
kubectl get cm fluid-routerlicious -o jsonpath='{.data.config\.json}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['auth'])"
```

reports `'enableTokenExpiration': True`. To confirm enforcement, sign a token with **no `exp`
claim** and call alfred with it — expect `403 Invalid token expiry`. An already-expired token is
not a valid check: those are rejected either way.

> **Superseded:** the SecretProviderClass now authenticates via **AAD Workload Identity** (one
> shared managed identity + a Kubernetes ServiceAccount, `azure/secretproviderclass.yaml`'s
> `clientID: <WORKLOAD_IDENTITY_CLIENT_ID>` parameter), not the CSI add-on's own
> auto-created identity referenced as `$CSI_IDENTITY_CLIENT_ID` below. See
> `azure/deploy.sh`'s `phase8_workload_identity` / `phase4_secrets_infra`.
>
> **Also superseded: there is no tenant key in Key Vault or the CSI mount anymore.** The chart
> no longer seeds a tenant into `riddler.tenants`, so Steps 3/3a's `tenant-key` file no longer
> applies -- `azure/deploy.sh`'s `phase5_bootstrap_tenant` creates the default `fluid` tenant
> through `tenant-admin.sh` instead, the same way as any other tenant.
> See [tenant-admin/README.md](../tenant-admin/README.md).

**Step 1: Render and apply the SecretProviderClass**

```bash
AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)
sed -e "s|<CSI_IDENTITY_CLIENT_ID>|$CSI_IDENTITY_CLIENT_ID|g" \
    -e "s|<KV>|$KV|g" \
    -e "s|<AZURE_TENANT_ID>|$AZURE_TENANT_ID|g" \
    azure/secretproviderclass.yaml > "$DEPLOY_DIR/secretproviderclass.yaml"
kubectl apply -f "$DEPLOY_DIR/secretproviderclass.yaml"
```

**Step 2: Install the Helm chart without key values**

```bash
helm install fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" \
  -f "$DEPLOY_DIR/routerlicious-values.yaml"
```

**Step 3: Patch alfred, nexus, and riddler to mount the CSI volume and wire the init container**

The upstream chart doesn't expose a values field for arbitrary CSI volumes or init containers.
Apply this patch after the Helm install to mount `/mnt/secrets` and wire the init container that
reads the tenant key and writes it to `/config/secrets.env`:

```bash
for deploy in fluid-alfred fluid-nexus fluid-riddler; do
  kubectl patch deployment "$deploy" --type=json -p='[
    {"op": "add", "path": "/spec/template/spec/volumes/-", "value": {
      "name": "fluid-secrets",
      "csi": {
        "driver": "secrets-store.csi.k8s.io",
        "readOnly": true,
        "volumeAttributes": {"secretProviderClass": "fluid-secrets"}
      }
    }},
    {"op": "add", "path": "/spec/template/spec/volumes/-", "value": {
      "name": "config",
      "emptyDir": {}
    }},
    {"op": "add", "path": "/spec/template/spec/initContainers", "value": [{
      "name": "load-secrets",
      "image": "busybox",
      "command": ["sh", "-c",
        "TENANT_KEY=$(cat /mnt/secrets/tenant-key) && echo \"export TENANT_KEY=$TENANT_KEY\" > /config/secrets.env"
      ],
      "volumeMounts": [
        {"name": "fluid-secrets", "mountPath": "/mnt/secrets", "readOnly": true},
        {"name": "config", "mountPath": "/config"}
      ]
    }]},
    {"op": "add", "path": "/spec/template/spec/containers/0/volumeMounts/-", "value": {
      "name": "config",
      "mountPath": "/config",
      "readOnly": true
    }}
  ]'
done
```

**Step 3a: Patch scribe and scriptorium to mount the Cosmos connection string**

The scribe and scriptorium services consume `mongodb.operationsDbEndpoint` but do not need the
tenant key. Apply a separate patch to wire the Cosmos connection string:

```bash
for deploy in fluid-scribe fluid-scriptorium; do
  kubectl patch deployment "$deploy" --type=json -p='[
    {"op": "add", "path": "/spec/template/spec/volumes/-", "value": {
      "name": "fluid-secrets",
      "csi": {
        "driver": "secrets-store.csi.k8s.io",
        "readOnly": true,
        "volumeAttributes": {"secretProviderClass": "fluid-secrets"}
      }
    }},
    {"op": "add", "path": "/spec/template/spec/volumes/-", "value": {
      "name": "config",
      "emptyDir": {}
    }},
    {"op": "add", "path": "/spec/template/spec/initContainers", "value": [{
      "name": "load-secrets",
      "image": "busybox",
      "command": ["sh", "-c",
        "COSMOS_CONN=$(cat /mnt/secrets/cosmos-connection-string) && echo \"export mongodb__operationsDbEndpoint=$COSMOS_CONN\" > /config/secrets.env"
      ],
      "volumeMounts": [
        {"name": "fluid-secrets", "mountPath": "/mnt/secrets", "readOnly": true},
        {"name": "config", "mountPath": "/config"}
      ]
    }]},
    {"op": "add", "path": "/spec/template/spec/containers/0/volumeMounts/-", "value": {
      "name": "config",
      "mountPath": "/config",
      "readOnly": true
    }}
  ]'
done
```

**Step 4: Confirm init containers ran and secrets are sourced**

The kubectl patches in Step 3 and 3a wire init containers that read the CSI-mounted secret files
and write them to `/config/secrets.env` (on a shared `emptyDir` volume). The application container
must source this file at startup for the secrets to reach the Node.js process.

**Known limitation:** this runbook cannot verify that Routerlicious's current entrypoint/startup
scripts actually source `/config/secrets.env` before starting the Node.js application. The upstream
chart's Dockerfiles and entrypoint scripts were not modified as part of this self-host project, and
no source-level instrumentation was added to confirm environment-file sourcing. If, after applying
the patches and redeploying, the application pods crash or log "missing tenant key" errors, the
most likely cause is that the container's startup command does not include `. /config/secrets.env`
before launching the Node.js server.

To manually verify the init container ran and the secrets file exists:

```bash
kubectl logs deploy/fluid-alfred -c load-secrets
kubectl exec deploy/fluid-alfred -c fluid-alfred -- cat /config/secrets.env
kubectl exec deploy/fluid-scribe -c load-secrets -- cat /config/secrets.env
```

Expected: the first command shows no errors; the second prints `export TENANT_KEY=<real-key>`;
the third prints `export mongodb__operationsDbEndpoint=<real-connection-string>`. If the secrets
file exists but the application still fails to authenticate, add `. /config/secrets.env` to the
container's entrypoint or use a sidecar to inject the env vars into the main container's process
namespace (both approaches require rebuilding the Routerlicious images or patching the chart's
entrypoint field).

**Why this pattern:** keeps secrets out of Helm release metadata and cluster ConfigMaps, restricts
access to the Key Vault Secrets User role (granted to the CSI identity in Phase 8), and supports
key rotation by redeploying pods after the Key Vault secret changes — no Helm upgrade or chart
modification required.

**VERIFY:** the alfred/nexus/deli/scriptorium/scribe/riddler pods reach `Running` with no
crash loop; `helm get values fluid` shows no `PLACEHOLDER_KEY` and no live key in Helm metadata;
`kubectl exec deploy/fluid-alfred -c fluid-alfred -- cat /mnt/secrets/tenant-key` returns the real
key (proving the CSI mount works); `kubectl exec deploy/fluid-alfred -c fluid-alfred -- cat
/config/secrets.env` shows `export TENANT_KEY=<real-key>` (proving the init container ran);
`kubectl exec deploy/fluid-scribe -c fluid-scribe -- cat /config/secrets.env` shows
`export mongodb__operationsDbEndpoint=<real-connection-string>`; and `helm get manifest fluid |
grep -i key` shows no plaintext key in rendered resources.

**Troubleshooting container names:** If any `kubectl exec` command fails with "container not found", run `kubectl get pod <pod-name> -o jsonpath='{.spec.containers[*].name}'` to discover the actual container names, then adjust the `-c` flag accordingly.

**VERIFY:** confirm the reference Ingress class is inactive:

```bash
kubectl get ingress fluid-alfred fluid-nexus -o custom-columns=NAME:.metadata.name,CLASS:.spec.ingressClassName
if kubectl get ingressclass selfhost-reference-disabled >/dev/null 2>&1; then
  echo "ERROR: selfhost-reference-disabled must not have an installed controller"
  exit 1
fi
```

### Phase 6 — Expose + client validation

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
use `--reuse-values` **without** reapplying the values file:

```bash
helm upgrade fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" --reuse-values \
  --set-string "alfred.host=<ALFRED_HOST>" \
  --set-string "alfred.externalUrl=http://<ALFRED_HOST>" \
  --set-string "historian.externalUrl=http://<HISTORIAN_HOST>"
```

Keep live addresses and credentials out of source control.

**VERIFY:** alfred and historian `/healthz/startup` return HTTP 200; the nexus socket.io
handshake succeeds; then use two clients to create/attach a document, exchange real-time
ops, cold-load and converge on the existing document, and confirm both clients appear in the
audience. This scenario was completed on the reference deployment. It used HTTP and
`InsecureTokenProvider`; it did not validate production security or load capacity.

### Phase 7 — Client token service

**Delivered state:** no token resource is created by this runbook. A separate, opt-in
deployment script now exists.

Fluid clients need a trusted backend that authenticates and authorizes callers, then signs
short-lived JWTs with the tenant key without ever exposing that key to the client. The
validated path instead used `InsecureTokenProvider` for development, which is not
production-safe (see [ARCHITECTURE.md](../ARCHITECTURE.md) §7.6 for the requirements a real
backend must meet).

[`token-service/`](../token-service/README.md) is a working reference implementation of that
backend: Microsoft Entra ID authentication via App Service Easy Auth, identity derived only
from platform-verified claims, the tenant key read from Key Vault through a managed identity,
and a single `authorize()` function as the intended customisation point.

```bash
token-service/deploy-token-service.sh
```

It is opt-in and deliberately separate from `deploy.sh`: the token backend is customer-operated,
and many teams will front Fluid with their own existing service instead. Deciding whether to
adopt, extend, or replace it remains the customer's own call — as does per-document
authorization, which the reference implementation does not attempt.

---

### Phase 8 — Key Vault + Cosmos DB for MongoDB (standard API) + Redis + Storage

**Creates:** an Azure Key Vault in the AKS resource group and enables the
Azure Key Vault Secrets Provider (Secrets Store CSI) add-on on the AKS cluster.

Follow these steps to provision Key Vault and enable the AKS Secrets Store CSI
driver. These commands are intended for the validated runbook and must be run
from a Bash session with `az` configured to the target subscription and the
variables in this document (`RG`, `RG_LOC`, `AKS`, etc.) already exported.

Step 1 — Create the Key Vault in the AKS resource group

```bash
KV="my-fluid-kv-001"
az keyvault create -g "$RG" -n "$KV" -l "$RG_LOC" --enable-rbac-authorization true
```

Expected: JSON output with `"provisioningState": "Succeeded"`.

Step 2 — Enable the Azure Keyvault Secrets Provider add-on on AKS

```bash
az aks enable-addons -g "$RG" -n "$AKS" --addons azure-keyvault-secrets-provider
az aks show -g "$RG" -n "$AKS" --query "addonProfiles.azureKeyvaultSecretsProvider.identity.clientId" -o tsv
```

Expected: the second command prints a non-empty GUID — record it as
`$CSI_IDENTITY_CLIENT_ID` (the managed identity used by the CSI driver).

> **Superseded:** this identity is no longer granted the Key Vault role below. Grant
> `Key Vault Secrets User` to the one workload identity instead (`azure/deploy.sh`'s
> `phase8_workload_identity` creates it; `phase8_keyvault` grants the role). This add-on
> identity still gets auto-created by AKS and is harmless left ungranted.

Step 3 — Grant that identity read access to secrets in the vault

```bash
KV_ID=$(az keyvault show -g "$RG" -n "$KV" --query id -o tsv)
az role assignment create --role "Key Vault Secrets User" \
  --assignee "$CSI_IDENTITY_CLIENT_ID" --scope "$KV_ID"
```

Expected: JSON output with `"roleDefinitionName": "Key Vault Secrets User"`.

**VERIFY:** confirm provisioning, the add-on, and the role assignment with the
commands below (the first prints `Succeeded`, the second prints `true`, and the
third includes `Key Vault Secrets User`). Live infrastructure verification is
deferred until Phases 0–7 have been performed in the target
subscription/resource group; the commands below are complete and ready for
run-time execution when the AKS cluster exists.

```bash
az keyvault show -g "$RG" -n "$KV" --query properties.provisioningState -o tsv
az aks show -g "$RG" -n "$AKS" --query "addonProfiles.azureKeyvaultSecretsProvider.enabled" -o tsv
az role assignment list --scope "$KV_ID" --query "[].roleDefinitionName" -o tsv
```

Step 1 — Create the Cosmos DB account (standard, RU-based API for MongoDB) in the AKS resource group

```bash
COSMOS="my-fluid-cosmos-001"
az cosmosdb create -n "$COSMOS" -g "$RG" --kind MongoDB --capabilities EnableMongo \
  --server-version 5.0 \
  --locations regionName="$RG_LOC" failoverPriority=0
```

Expected: JSON output with `"provisioningState": "Succeeded"` (provisioning can take several minutes).

> **Capacity note — Provisioned, not Serverless.** Serverless has a hard, non-negotiable
> 5,000 RU/s-per-container ceiling with no path to raise it short of migrating off Serverless
> entirely -- not a real capacity decision for the target load.

Step 1b — Per-collection throughput (informed by a production reference deployment)

The chart's `fluid-configmap.yaml` hard-codes 8 Mongo collection names
(`mongo.collectionNames`): `deltas`, `documents`, `checkpoints`, `partitions`, `tenants`,
`nodes`, `reservations`, `scribeDeltas`. Provisioned-mode Cosmos requires throughput per
collection (Serverless has none at all). Values below mirror a known-good
production-adjacent reference setting for the 5 collections it has, extrapolated for the
other 3 -- starting points, not load-test-derived final values:

```bash
# deltas needs a shard key (documentId, hash-partitioned, matching the reference deployment)
# since it's the only collection sized past the ~10,000 RU/s "fixed" container ceiling.
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n deltas --shard documentId --max-throughput 50000
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n scribeDeltas --max-throughput 4000
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n checkpoints --max-throughput 10000
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n documents --max-throughput 4000
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n tenants --max-throughput 4000
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n nodes --max-throughput 4000
az cosmosdb mongodb collection create -a "$COSMOS" -g "$RG" -d admin -n reservations --max-throughput 4000
```

> **7 collections, not 8 (and not 5 -- corrected after an incomplete first check).** The
> chart's `fluid-configmap.yaml` declares 8 names in `mongo.collectionNames`. Reading the real
> resource-creation source across **all 6** top-level services confirms 7 are actually read:
> `deltas`, `documents`, `checkpoints`, `scribeDeltas`, `tenants` (alfred/scribe/deli/riddler --
> see below), plus **`nodes`/`reservations`**, read by **nexus**
> (`packages/routerlicious-base/src/nexus/runnerFactory.ts`:
> `new NodeManager(operationsDbMongoManager, config.get("mongo:collectionNames:nodes"))` and
> `new ReservationManager(nodeManager, operationsDbMongoManager,
> config.get("mongo:collectionNames:reservations"))`, imported from
> `@fluidframework/server-memory-orderer` -- easy to miss, since it's a different package than
> `services-core` and the classes aren't named after the collections. Both feed
> `LocalOrderManager`, which is unconditionally constructed and wired into nexus's real
> `OrdererManager` on every startup. **`nodes` and `reservations` were incorrectly deleted once
> during this capacity work**, based on a check of only 5 of the 6 services (nexus wasn't read
> yet) -- recreated once nexus's actual source confirmed the usage. Only **`partitions`** is
> confirmed unused anywhere across all 6 services and intentionally not created.
>
> **All 7 collections are autoscale, not just the 3 highest-frequency ones.**
> `documents`/`tenants`/`nodes`/`reservations` have low average load (session-lifecycle-event,
> per-tenant metadata, or per-nexus-pod lease renewal via `NodeManager`/`ReservationManager`,
> not per-op), but manual throughput is a hard cap -- exceeding it causes 429 throttling with
> no automatic headroom. All four have a real, plausible burst risk unrelated to steady-state
> traffic: mass client reconnects after a network blip, or many deli/nexus pods restarting
> near-simultaneously after a rolling deploy or HPA scale event, each triggering a burst of
> reads/writes at once. Azure's autoscale floor bills at 10% of the max (~400 RU/s when idle,
> the same as a manual 400 floor), so there's no real average-case cost penalty versus manual
> -- only burst protection. 4000 is Azure's autoscale minimum ceiling (the lowest available),
> not a guess at real peak need for these four.
>
> `documents` looks central (alfred/scribe/deli all use it), but tracing the actual call site
> (`DeliLambdaFactory.create` -> `this.documentRepository.readOne({ documentId, tenantId })`)
> shows it fires once per document-partition-lambda lifecycle (a session/document open), not
> once per operation -- a much lower, session-arrival-rate-scaled frequency than `deltas`,
> despite superficially looking equally "hot". The reference deployment used for comparison
> doesn't show `documents`/`nodes`/`reservations` in its `admin` database at all (likely
> `mongo:globalDbEnabled=true` for `documents`, and it may not exercise the
> local-order-manager path routinely for the other two), so these three values are sized from
> the source-verified usage pattern directly, not copied from that reference.

> **Index note:** the `deltas` collection also needs a unique compound index (`documentId`,
> `operation.sequenceNumber`, `tenantId`) and a `mongoTimestamp` TTL index (matching
> `mongodb.expireAfterSeconds` above). Both were confirmed live to be **rejected by Cosmos's
> ARM control-plane API** (`az cosmosdb mongodb collection create --idx` -- "Unique and
> compound indexes do not support nested paths" / "expireAfterSeconds option is supported on
> '_ts' field only"), but accepted fine over the native MongoDB wire protocol. Leave
> `mongodb.createCosmosDBIndexes: false` (the chart's own default) in `routerlicious-values.yaml`
> -- confirmed by reading `scriptorium/index.ts` directly that `true` does NOT recreate the
> same indexes "Cosmos-compatible"; it creates a **different, weaker** set (5 separate
> non-unique indexes, dropping the uniqueness guarantee; TTL on `_ts` instead of
> `mongoTimestamp`). `false` creates the correct compound-unique + `mongoTimestamp` TTL indexes
> via the native driver, which is what the working collection already had before this capacity
> work -- Routerlicious does this itself on next startup for any collection missing them.

> **Architecture note — this uses the RU-based "API for MongoDB" account type, not Cosmos DB
> for MongoDB vCore.** Azure has two distinct "Cosmos DB for MongoDB" products: the original,
> GA, RU-billed **"API for MongoDB"** (`--kind MongoDB`, what's deployed here), and the newer
> **vCore** option (`az cosmosdb mongocluster create`, a separate VM-based deployment model,
> not RU-billed) — this repo originally targeted vCore, but that preview control plane
> returned a persistent, reproducible `internal_server_error` during validation
> (confirmed via raw ARM REST calls too — not a CLI bug; ruled out API version, region, and
> policy causes). Routerlicious's `mongodb.operationsDbEndpoint` consumes either option
> identically — just a MongoDB wire-protocol connection string. `--capabilities EnableMongo`
> is required, not cosmetic: some Azure Policy configurations (baseline security policies
> restricting local/key-based auth) deny any Cosmos account with local auth enabled unless its
> capabilities list explicitly declares `EnableMongo` — `--kind MongoDB` alone does not
> populate that list.

Step 2 — Store the connection string in Key Vault

```bash
COSMOS_CONN=$(az cosmosdb keys list -n "$COSMOS" -g "$RG" --type connection-strings \
  --query "connectionStrings[0].connectionString" -o tsv)
az keyvault secret set --vault-name "$KV" --name cosmos-connection-string --value "$COSMOS_CONN"
unset COSMOS_CONN
```

Expected: `az keyvault secret set` returns JSON with a non-empty `id` (the secret's versioned URI).

> **Secrets Store CSI driver integration.** The connection string is mounted into application pods
> via the SecretProviderClass configured in Phase 5. The init-container pattern reads
> `/mnt/secrets/cosmos-connection-string` and injects it as the `mongodb.operationsDbEndpoint`
> environment variable at pod startup. This replaces any manual `sed` substitution of
> `COSMOS_CONNECTION_STRING_PLACEHOLDER` in `routerlicious-values.yaml`.

**VERIFY:** confirm cluster provisioning and secret storage with the commands below (the first
prints `Succeeded`, the second returns a non-empty URI).

```bash
az cosmosdb show -n "$COSMOS" -g "$RG" --query provisioningState -o tsv
az keyvault secret show --vault-name "$KV" --name cosmos-connection-string --query id -o tsv
```

Step 1 — Confirm the current CLI command group for Azure Managed Redis

```bash
az redisenterprise create --help 2>/dev/null | head -5
```

Expected: help output for `az redisenterprise create` listing `--cluster-name`,
`--resource-group`, `--location`, and `--sku`.

Step 2 — Create Azure Managed Redis in the AKS resource group

```bash
REDIS="my-fluid-redis-001"
az redisenterprise create \
  --name "$REDIS" \
  --resource-group "$RG" \
  --location "$RG_LOC" \
  --sku Balanced_B5 \
  --high-availability Enabled \
  --minimum-tls-version 1.2 \
  --public-network-access Disabled \
  --access-keys-authentication Enabled \
  --client-protocol Encrypted \
  --clustering-policy NoCluster \
  --eviction-policy VolatileLRU \
  --port 10000
```

Expected: `"provisioningState": "Succeeded"`. `Balanced_B5` is Microsoft's current
non-clustered Premium P1 migration mapping (6 GB advertised, approximately 4.8 GB usable).
Treat it as a starting point and size from observed cache metrics. HA instances are
zone-redundant by default in supported regions, so the deployment does not pin zones or retry
with a silently degraded non-HA configuration.

> **Architecture note:** the earlier Azure Managed Redis attempt combined an older Enterprise
> SKU family that repeatedly encountered regional allocation failures with Entra-only
> authentication. The second choice was independently incompatible:
> `RedisClientConnectionManager` is password-based and cannot refresh Entra tokens. Azure
> Managed Redis now supports explicitly enabled access keys, so the key is retrieved with
> `az redisenterprise database list-keys`, stored as `redis-password` in Key Vault, and
> CSI-mounted into every workload. `NoCluster` preserves compatibility with Fluid's standalone
> client, encrypted port `10000` replaces Azure Cache for Redis's TLS port `6380`, and a Private
> Endpoint is the only network path.

**VERIFY:** confirm cache provisioning and retrieve the connection details.

```bash
az redisenterprise show --name "$REDIS" --resource-group "$RG" --query provisioningState -o tsv
az redisenterprise show --name "$REDIS" --resource-group "$RG" --query hostName -o tsv
az redisenterprise database show --cluster-name "$REDIS" --resource-group "$RG" \
  --query '{state:provisioningState,auth:accessKeysAuthentication,protocol:clientProtocol,clustering:clusteringPolicy,port:port}'
```

Step 1 — Create the Storage Account and file share directly in the AKS resource group

```bash
STORAGE="myfluidgitrest001"   # storage account names: lowercase alphanumeric only, <=24 chars
az storage account create -g "$RG" -n "$STORAGE" -l "$RG_LOC" --sku Standard_LRS --kind StorageV2
az storage share-rm create -g "$RG" --storage-account "$STORAGE" --name gitrest-data --quota 16
```

Expected: `az storage account create` returns `"provisioningState": "Succeeded"`.

Step 2 — Grant the AKS kubelet identity access to fetch the storage key from ARM

`azure/backends.yaml`'s StorageClass has no `secretName` — the Azure File CSI driver fetches
the storage key directly from ARM at mount time using the AKS kubelet identity, instead of
reading a static Kubernetes Secret (no such Secret is created in this phase):

```bash
KUBELET_IDENTITY=$(az aks show -g "$RG" -n "$AKS" --query identityProfile.kubeletidentity.objectId -o tsv)
STORAGE_ID=$(az storage account show -g "$RG" -n "$STORAGE" --query id -o tsv)
az role assignment create --assignee-object-id "$KUBELET_IDENTITY" --assignee-principal-type ServicePrincipal \
  --role "Storage Account Key Operator Service Role" --scope "$STORAGE_ID"
```

Expected: JSON output with `"roleDefinitionName": "Storage Account Key Operator Service Role"`.

**VERIFY:** confirm the Storage Account provisioned successfully and is not in the node
resource group (the first command prints `Succeeded`; the second returns an empty array).
The `gitrest-data` PVC binding itself is verified in Phase 4, once `backends.yaml` — which
references this Storage Account by name — is actually applied there.

```bash
az storage account show -g "$RG" -n "$STORAGE" --query provisioningState -o tsv
az resource list -g $(az aks show -g "$RG" -n "$AKS" --query nodeResourceGroup -o tsv) --query "[?name=='$STORAGE']"
```

The tenant key is no longer stored in Key Vault. `azure/deploy.sh` no longer has a
`phase8_tenant_key` step -- every tenant, including the default `fluid` one, gets its key from
riddler at creation time via `tenant-admin.sh` (see `phase5_bootstrap_tenant` and
[tenant-admin/README.md](../tenant-admin/README.md)), and that key lives durably in Cosmos DB.

---

### Phase 10 — Multi-replica baseline and HPA for the application tier

**Goal:** Enable horizontal auto-scaling for the six application-tier Deployments (alfred, nexus, deli, scriptorium, scribe, riddler) by raising baseline replicas to 2 and attaching `HorizontalPodAutoscaler` objects.

**Step 1: Set CPU/memory resource requests, then apply the replica-count and HPA changes**

CPU-utilization-based HPA cannot compute a percentage without a `resources.requests.cpu`
baseline on the target containers -- the chart sets none by default (confirmed: no `resources`
key anywhere in the chart's `values.yaml` or templates), which is why this must be patched in
before `kubectl apply -f azure/hpa.yaml`, not after. `deploy.sh`'s `phase5_helm` now does this
automatically (idempotent `kubectl patch ... --type=json`); the equivalent standalone commands:

```bash
for deploy in fluid-alfred fluid-nexus fluid-deli fluid-scriptorium fluid-scribe fluid-riddler; do
  kubectl patch deployment "$deploy" --type=json -p='[
    {"op": "add", "path": "/spec/template/spec/containers/0/resources", "value": {
      "requests": {"cpu": "250m", "memory": "256Mi"},
      "limits": {"cpu": "1", "memory": "512Mi"}
    }}]'
done
sed -e "s|<ACR>|$ACR|g" -e "s|<IMAGE_TAG>|$IMAGE_TAG|g" \
  azure/routerlicious-values.yaml > "$DEPLOY_DIR/routerlicious-values.yaml"
helm upgrade fluid "$FLUID_ROOT/server/routerlicious/kubernetes/routerlicious" \
  --reuse-values -f "$DEPLOY_DIR/routerlicious-values.yaml"
kubectl apply -f azure/hpa.yaml
```

Expected: `helm upgrade` reports `STATUS: deployed`; `kubectl apply` reports 6 HPAs `created`.

**VERIFY:** All 6 application-tier Deployments reach `readyReplicas: 2` with no crash loop, and all 6 HPAs report real (non-`<unknown>`) CPU metrics:

```bash
kubectl get deploy fluid-alfred fluid-nexus fluid-deli fluid-scriptorium fluid-scribe fluid-riddler \
  -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,UP-TO-DATE:.status.updatedReplicas
kubectl get hpa -o custom-columns=NAME:.metadata.name,TARGETS:.status.currentMetrics[0].resource.current.averageUtilization,MIN:.spec.minReplicas,MAX:.spec.maxReplicas
```

Each Deployment should show `READY: 2` and `UP-TO-DATE: 2`. Each HPA should show a numeric `TARGETS` value (not `<unknown>`), `MIN: 2`, and `MAX: 10`.

---

### Phase 12 — Azure Front Door (TLS)

**Goal:** Deploy Azure Front Door (Standard) for TLS across alfred/nexus/historian endpoints.

**Step 1: Create the profile and one endpoint/origin-group/origin/route per service**

```bash
AFD="my-fluid-afd-001"
az afd profile create -g "$RG" --profile-name "$AFD" --sku Standard_AzureFrontDoor

for svc in alfred nexus historian; do
  ENDPOINT_NAME="${svc}-${AFD}"
  case "$svc" in
    alfred) LB_HOST=$(kubectl get svc fluid-alfred-public -o jsonpath='{.status.loadBalancer.ingress[0].ip}') ;;
    nexus) LB_HOST=$(kubectl get svc fluid-nexus-public -o jsonpath='{.status.loadBalancer.ingress[0].ip}') ;;
    historian) LB_HOST=$(kubectl get svc historian-public -o jsonpath='{.status.loadBalancer.ingress[0].ip}') ;;
  esac
  az afd endpoint create -g "$RG" --profile-name "$AFD" --endpoint-name "$ENDPOINT_NAME" --enabled-state Enabled
  az afd origin-group create -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" \
    --probe-request-type GET --probe-protocol Http --probe-path /healthz/startup --probe-interval-in-seconds 30 \
    --sample-size 4 --successful-samples-required 3
  az afd origin create -g "$RG" --profile-name "$AFD" --origin-group-name "${svc}-og" --origin-name "${svc}-origin" \
    --host-name "$LB_HOST" --origin-host-header "$LB_HOST" --http-port 80 --priority 1 --weight 1000 --enabled-state Enabled
  az afd route create -g "$RG" --profile-name "$AFD" --endpoint-name "$ENDPOINT_NAME" --route-name "${svc}-route" \
    --origin-group "${svc}-og" --supported-protocols Https --patterns-to-match "/*" \
    --forwarding-protocol HttpOnly --https-redirect Enabled
done
```

Expected: each `az afd endpoint create` returns JSON with a `hostName` like
`alfred-<profile>-<hash>.z01.azurefd.net`; each `az afd route create` returns
`"deploymentStatus": "InProgress"` then eventually `"Succeeded"` (poll with
`az afd route show` if needed).

**Step 2: Restrict the origin LoadBalancer Services to Front Door only**

Automated by `phase12_restrict_origin_nsg` in `deploy.sh`. A single Allow (`AzureFrontDoor.Backend`,
port 80) plus an explicit Deny (`Internet`, port 80) go on the AKS node pool's NSG, both at a lower
priority number than the cloud-provider's own auto-created `k8s-azure-lb_allow_...` rule (priority
500) — so non-AFD internet traffic is denied before it ever reaches that rule. One NSG is shared by
all AKS nodes, so this covers alfred, nexus, and historian's LoadBalancer IPs at once (all three
listen on port 80); no per-service repetition needed.

The script also reconciles a policy-attached NSG on `aks-subnet`. Azure Policy can attach and
populate that NSG several minutes after subnet creation, so the script checks once during network
setup and again during the final Front Door phase. It chooses an unused allow-rule priority ahead
of any applicable organization-managed Internet deny instead of assuming a fixed priority. The
deployment does not finish until all three health paths return HTTP 200 through Front Door.

**Caveat confirmed live:** some Azure environments have their own policy-auto-attached
baseline NSG rules (permitting broad access from the organization's own internal network) that
sit at a lower priority number than both rules above, so a direct curl from a machine on that
internal network will still succeed — that's the pre-existing organizational policy taking
precedence, not a gap in this restriction. Only genuine external, non-Front-Door internet
traffic is actually denied, so VERIFY this from a network path outside your organization's
internal network (e.g. cellular data, not a corporate VPN).

**VERIFY:** Confirm Front Door endpoints are accessible and direct LoadBalancer access is restricted:

```bash
curl -fsS https://alfred-<profile>-<hash>.z01.azurefd.net/api/v1/ping
curl -fsS https://nexus-<profile>-<hash>.z01.azurefd.net/healthz/startup
curl -fsS https://historian-<profile>-<hash>.z01.azurefd.net/repos/ping
curl -v https://nexus-<profile>-<hash>.z01.azurefd.net/socket.io/
curl -fsS http://<LB_IP>/healthz/startup || echo "Direct access blocked (expected, from outside your internal network)"
```

Expected: First two curl commands return HTTP 200 over HTTPS with a Front-Door-issued certificate; the nexus socket.io handshake succeeds through the Front Door hostname; the direct LoadBalancer access — tested from a network path outside your organization's internal network — now times out or is refused, proving the NSG restriction took effect.

---

### Post-deployment inventory

Record the deployment without committing live identifiers or secrets:

```bash
az group show -n "$RG" --query '{name:name,location:location,state:properties.provisioningState}' -o table
az resource list -g "$RG" --query '[].{type:type,name:name,location:location}' -o table
az aks show -g "$RG" -n "$AKS" --query '{cluster:name,nodeResourceGroup:nodeResourceGroup,kubernetesVersion:kubernetesVersion,state:provisioningState}' -o table
kubectl get deploy,statefulset,svc,pvc,configmap,ingress
kubectl get storageclass
az eventhubs namespace show -g "$RG" -n "$EVENTHUBS_NAMESPACE" --query "{kafka:kafkaEnabled,zr:zoneRedundant,net:publicNetworkAccess}"
```

The `MC_...` group is an AKS-generated implementation record. It can be inspected with
`az resource list -g <node-resource-group>`, but it must not become a separately deployed template
or a second source of truth.

## Tenant management (post-deployment)

The deployment seeds one tenant, `fluid`. Additional tenants are created after Phase 6 with
[`../tenant-admin/tenant-admin.sh`](../tenant-admin/tenant-admin.sh), which reads the same
`deploy.parameters.json` this runbook uses:

```bash
../tenant-admin/tenant-admin.sh create <tenantId> --contact <owner-email>
../tenant-admin/tenant-admin.sh list
../tenant-admin/tenant-admin.sh rotate <tenantId> --key key2
../tenant-admin/tenant-admin.sh delete <tenantId>
```

Each tenant gets its own `key1`/`key2` and its own gitrest repository (`fluid/<tenantId>` on the
Azure Files PV), and cross-tenant tokens are rejected. Their keys live in the operations database
and are never reset, so there is no Key Vault mirror — `get-key` re-reads one on demand.

If the [token service](../token-service/README.md) is deployed, `rotate` first checks the key
against that tenant's Key Vault secret and refuses to rotate the key the Function App is actively
signing with — rotating it would break token minting until the new value reached the vault. Rotate
the other key first, publish it, then rotate this one. See
[tenant-admin/README.md](../tenant-admin/README.md#the-in-use-key-check).

**Check:** `../tenant-admin/tenant-admin.sh get <tenantId>` returns a config whose
`storage.repository` equals the tenant id, and `../tenant-admin/tenant-admin.sh get-key <tenantId>`
returns its `key1`/`key2`.

The command runs the CLI inside the cluster in a short-lived Pod built from the deployed
routerlicious image, because **riddler has no authentication** and must stay a ClusterIP with no
Ingress — `GET /api/tenants/:id/keys` returns plaintext signing keys to any caller that can reach
it. The effective authorization boundary is Azure RBAC on the AKS cluster resource. Deleting a
tenant does not delete its repository; gitrest has no delete route. Full details, including the
key-rotation procedure, are in [../tenant-admin/README.md](../tenant-admin/README.md).

## Production hardening (beyond this runbook)

- **TLS and DNS:** replace public HTTP LoadBalancers with HTTPS/WSS endpoints, certificates,
  and an owned domain/renewal process.
- **Production auth and secrets:** replace `InsecureTokenProvider` with a trusted backend —
  either [`token-service/`](../token-service/README.md) or your own. Note that the reference
  service authorizes at tenant level only, so per-document access control is still yours to add.
  Keep tenant keys in a secret store with rotation; the reference Helm CLI key flow is not
  production-safe.
- **Broker durability and HA:** ordering runs on Azure Event Hubs (Phase 3), a managed PaaS
  service with service-managed replication and no broker disks to own. The namespace is
  zone-redundant, so a single-zone outage does not take it down, and it lives in the deployment's
  own resource group rather than the AKS-managed `MC_...` group, so it survives AKS cluster
  deletion. Remaining work: validate throughput under real load and confirm the throughput-unit
  count (design spec Section 4) — `capacity` is a hard ceiling because auto-inflate is off,
  though it can be raised on a live namespace.
- **Durable-state survivability if the AKS cluster is deleted:** Cosmos DB for MongoDB, Azure
  Managed Redis and the Event Hubs namespace are all provisioned outside the AKS node resource
  group — deleting the AKS cluster (or its `MC_...` node resource group) does not affect them.
  The gitrest Azure Files share is the remaining exception; see "Durable-state survivability"
  below.
- **Snapshots on Azure Blob:** gitrest has **no Blob backend in OSS** (only local-fs / mem /
  redis). Azure Files (this runbook) is the zero-code managed option; Blob (a hosted-service
  model) requires **writing a new `IFileSystemManager` adapter**.
- **MongoDB:** Phase 8 provisions Cosmos DB for MongoDB (standard, RU-based API — vCore was
  tried first but hit a persistent backend error, see Phase 8's architecture note) and wires
  `mongodb.operationsDbEndpoint` via the Secrets Store CSI driver. Remaining work: validate
  Cosmos compatibility with real load, test connection-string auth/TLS end-to-end, implement
  backup/restore, conduct failover testing, and measure performance against the sizing
  assumptions in design spec Section 4.
- **Managed Redis-compatible service:** Phase 8 provisions Azure Managed Redis with access-key
  authentication and non-clustered compatibility for Fluid's password-only standalone client
  (see Phase 8's architecture note), then wires its host/port/TLS/key into the Helm values and raw
  gitrest/historian Deployments. Remaining work: validate client compatibility and recovery/
  failover behavior under real load.
- **Image pinning:** pin every application and infrastructure image by a unique immutable tag or
  digest, including the proxy images (Cosmos DB, Azure Managed Redis and Event Hubs are
  managed services with no image to pin); retain a tested rollback set.
- **Storage ownership:** decide whether the AKS-provisioned Azure Files and managed disks may
  remain associated with cluster-managed resources or must move under a separately managed
  storage lifecycle and backup owner.
- **Operations:** add resource sizing, multiple replicas where supported, PDBs, monitoring,
  alerts, SLOs, upgrade/rollback procedures, and tested backup/restore.

## Pausing to save cost

To stop paying for compute without destroying anything:

```bash
az aks stop -g <your-resource-group> -n <your-aks-name>     # stop
az aks start -g <your-resource-group> -n <your-aks-name>    # resume
```

Stopping the cluster does **not** stop everything. Cosmos DB, Redis, Event Hubs, Storage, public
load balancer IPs and retained disks all keep billing while the cluster is stopped. To stop paying
entirely, delete the resource group — see [Removing the deployment](#removing-the-deployment).

A retained disk is not a backup. Before relying on this deployment for anything you cannot lose,
define and actually test recovery for Cosmos DB and for gitrest's snapshot storage.
