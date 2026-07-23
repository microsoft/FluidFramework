<!--
Copyright (c) Microsoft Corporation and contributors. All rights reserved.
Licensed under the MIT License.
-->

# skill.md — deploy ACR + AKS for self-host Fluid (Azure)

This documents the Azure infrastructure (an Azure Container Registry and an AKS cluster) and
the deployment steps for the self-host Fluid reference, plus a parameterized ARM template for
reproducing it. Resource names, locations, versions, and sizes are **parameters** — pick your
own.

> AKS also creates a **managed node resource group** named
> `MC_<your-rg>_<your-aks>_<aks-region>`. It is **auto-provisioned and owned by AKS** — you do
> **not** author or deploy it. It is created when the cluster is created, and removed when the
> cluster (or its resource group) is deleted.

## Scope / identity

Choose your own names; the values below are placeholders used throughout this document.

| Fact | Value (placeholder) |
| --- | --- |
| Subscription | `<your-subscription-id>` |
| Primary resource group | `<your-rg>` (for example, RG metadata location **eastus**) |
| AKS node resource group | `MC_<your-rg>_<your-aks>_<aks-region>` (auto-created by AKS) |
| ACR | `<your-acr>` → `<your-acr>.azurecr.io` (Standard, admin enabled) |
| AKS cluster | `<your-aks>` (Kubernetes **1.35**) |

## Deploy files (ARM templates)

The templates live in [azure/arm/](../arm) (a sibling of this folder, so multiple
differently-named deployments can share them). Resource names, locations, versions, and
sizes are **parameters** — change a name by editing the matching `*.parameters.json`; no
template edits required.

| File | What it is |
| --- | --- |
| [azure/arm/main.template.json](../arm/main.template.json) | Parameterized ARM template — ACR + AKS + system node pool + ACR scope maps. **Deployable** (validated server-side; provide your own `sshPublicKey`). |
| [azure/arm/main.parameters.json](../arm/main.parameters.json) | Parameter values for `main.template.json` (edit these to your own names/regions). |

### Parameters (`main.template.json`)

| Parameter | Default | Purpose |
| --- | --- | --- |
| `acrName` | `youracrname` | Registry name (globally unique) |
| `acrLocation` | `eastus` | Registry region |
| `aksClusterName` | `your-aks-cluster` | AKS cluster name |
| `aksLocation` | `eastus2` | AKS + `MC_` node group region |
| `kubernetesVersion` | `1.35` | Control-plane version |
| `nodeVmSize` | `Standard_D4as_v4` | System node pool VM size |
| `nodeCount` | `3` | System node pool node count |
| `dnsPrefix` | `aks-cluster` | API server DNS prefix |
| `sshPublicKey` | *(required — no default; provide your own)* | Linux node SSH public key |

`nodeResourceGroup` is **computed** — `MC_<resourceGroup().name>_<aksClusterName>_<aksLocation>`
— so the `MC_...` name tracks the parameters automatically.

### How `main.template.json` was built

The resource group was exported, then the hardcoded names/locations were lifted into parameters:

```bash
az group export --resource-group <your-rg> \
  --skip-resource-name-params --skip-all-params > main.template.json
# then: names/locations/versions/sizes extracted into main.parameters.json and referenced
# via [parameters('...')]; runtime-only bits (live agentPool `machines` instances and the
# pinned kubelet `identityProfile`) were removed so a fresh, differently-named cluster
# deploys cleanly.
```

---

## What gets created

Deploying `main.template.json` (or the `az` steps below) creates, in your resource group:

- **ACR** (Standard, admin enabled) — your image registry.
- **AKS cluster** with a system node pool — your Kubernetes cluster.
- Built-in ACR **scope maps**.

Creating the cluster also causes AKS to provision its **managed node resource group**
(`MC_<your-rg>_<your-aks>_<aks-region>`), containing the VMSS nodes, VNet and subnets, network
security group, load balancer, public IPs, managed identities, and any PVC-backed storage your
workloads request (Azure Files shares and managed disks). AKS owns and manages that group; you
do not author it.

---

## Deployment steps (create the infrastructure from scratch)

These `az` commands create the ACR + AKS. The `MC_...` node group is created automatically by
Step 3 — you never author it.

### Step 0 — Variables & context

```bash
SUB=<your-subscription-id>   # your subscription
RG=<your-rg>
ACR=<your-acr>               # 5-50 lowercase alphanumerics, globally unique
AKS=<your-aks>
ACR_LOC=eastus               # ACR + RG metadata (pick your region)
AKS_LOC=eastus2              # AKS cluster + its MC_ node group

az account set --subscription "$SUB"
```

### Step 1 — Resource group  `[Microsoft.Resources/resourceGroups]`

```bash
az group create -n "$RG" -l "$ACR_LOC"
```

**VERIFY:** `az group show -n "$RG" --query properties.provisioningState -o tsv` → `Succeeded`.

### Step 2 — Azure Container Registry  `[Microsoft.ContainerRegistry/registries]`

Standard SKU, admin user enabled, public network access enabled.

```bash
az acr create -g "$RG" -n "$ACR" -l "$ACR_LOC" --sku Standard --admin-enabled true
```

**VERIFY:** `az acr show -n "$ACR" --query "{login:loginServer,sku:sku.name,admin:adminUserEnabled}"`
→ `<your-acr>.azurecr.io`, `Standard`, `true`.

### Step 3 — AKS managed cluster  `[Microsoft.ContainerService/managedClusters]`

Kubernetes 1.35, 3× `Standard_D4as_v4` system nodes (128 GB managed OS disk, maxPods 250),
**Azure CNI overlay** dataplane, standard load balancer with 1 managed outbound IP, OIDC
issuer, and the **azure-policy** addon. System-assigned identity; RBAC enabled. This call
also creates the managed node group `MC_<your-rg>_<your-aks>_<aks-region>`.

```bash
az aks create -g "$RG" -n "$AKS" -l "$AKS_LOC" \
  --kubernetes-version 1.35 \
  --node-count 3 \
  --node-vm-size Standard_D4as_v4 \
  --node-osdisk-size 128 \
  --node-osdisk-type Managed \
  --os-sku Ubuntu \
  --max-pods 250 \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane azure \
  --network-policy none \
  --pod-cidr 10.244.0.0/16 \
  --service-cidr 10.0.0.0/16 \
  --dns-service-ip 10.0.0.10 \
  --load-balancer-sku standard \
  --outbound-type loadBalancer \
  --enable-oidc-issuer \
  --enable-addons azure-policy \
  --node-os-upgrade-channel NodeImage \
  --tier free \
  --generate-ssh-keys
```

**VERIFY:**

```bash
az aks show -g "$RG" -n "$AKS" --query \
  "{k8s:kubernetesVersion,state:provisioningState,nodeRG:nodeResourceGroup}" -o json
# expect: 1.35 / Succeeded / MC_<your-rg>_<your-aks>_<aks-region>
```

### Step 4 — Cluster credentials

```bash
az aks get-credentials -g "$RG" -n "$AKS"
kubectl get nodes            # 3 nodes Ready
kubectl get storageclass     # azurefile-csi, managed-csi present
```

### Step 5 — (Observed extras created on demand)

The following in the `MC_...` group are created **lazily by the cluster**, not by the steps
above — recreate them only by running the corresponding workload:

- **Azure Files share** — bound when a PVC uses `azurefile-csi` (the gitrest snapshot PV in
  this project).
- **Managed disk** (StandardSSD_LRS) — bound when a PVC uses `managed-csi` (e.g. the Mongo PV).
- Extra `kubernetes-*` public IPs / LB rules — created when a `Service type=LoadBalancer`
  is exposed.

---

## Deploy the parameterized ARM template (`main.template.json`)

Recreate the infrastructure from the template instead of the `az aks create` path above.
Edit `main.parameters.json` with your names, then:

```bash
az group create -n <your-rg> -l eastus
az deployment group create \
  --resource-group <your-rg> \
  --template-file azure/arm/main.template.json \
  --parameters @azure/arm/main.parameters.json
```

**Override inline** — change any parameter without editing the file:

```bash
az group create -n my-rg -l eastus
az deployment group create \
  --resource-group my-rg \
  --template-file azure/arm/main.template.json \
  --parameters @azure/arm/main.parameters.json \
      acrName=mycompanyacr001 \
      aksClusterName=my-aks \
      aksLocation=westus2
# nodeResourceGroup becomes MC_my-rg_my-aks_westus2 automatically.
```

> AKS auto-creates and owns the managed node group (`MC_...`); you never author or deploy it.
> Deleting the cluster (or its resource group) removes it automatically.

---

## Teardown

Deleting the cluster (or the whole `<your-rg>` group) also deletes the `MC_...` group
automatically.

```bash
# Cluster only (also removes MC_ group):
az aks delete -g <your-rg> -n <your-aks> --yes --no-wait

# Everything:
az group delete -n <your-rg> --yes --no-wait
```
