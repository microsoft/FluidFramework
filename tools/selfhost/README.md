# Self-host Fluid Framework on Azure

Run Fluid Framework as a service you operate yourself, in your own Azure subscription.

This repository deploys the full, multi-service Routerlicious topology onto Azure Kubernetes
Service, with Azure Event Hubs for ordering, Azure Cosmos DB for MongoDB for document data and
operations, Azure Managed Redis, and Azure Files for snapshots. You own every resource it
creates.

## Cost

> **Planned:** a basic cost estimate for the default configuration will be added here.

This deployment provisions managed Azure services — AKS nodes, Azure Managed Redis,
provisioned-throughput Cosmos DB, Event Hubs, and Front Door. They bill from the moment they are
created, not only while you are actively using them. Until an estimate is published here, price
your own configuration with the
[Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/).

`azure/README.md` covers [pausing to save cost](./azure/README.md#pausing-to-save-cost) and
[removing the deployment](./azure/README.md#removing-the-deployment).

## Where to start

Work through these in order. Each folder has its own README with the detail.

| # | Step | Where |
| - | ---- | ----- |
| 1 | **Configure** — copy `azure/deploy.parameters.example.json` to `azure/deploy.parameters.json` and fill it in. Both the release and the deployment read this same file, so it comes first | [azure/](./azure/README.md#step-1--create-your-configuration-file) |
| 2 | **Build a release bundle** — pins the exact source revision and image digests to deploy | [release/](./release/README.md) |
| 3 | **Deploy to Azure** — one script creates every resource and installs the service | [azure/](./azure/README.md) |
| 4 | **Verify it works** — two real Fluid clients collaborating end to end | [deploy-validate/](./deploy-validate/README.md) |
| 5 | **Create your own tenants** — the deployment starts with one default tenant | [tenant-admin/](./tenant-admin/README.md) |
| 6 | **Issue client tokens** — optional reference implementation, or bring your own | [token-service/](./token-service/README.md) |

Steps 1–4 get you a running, verified deployment. Steps 5–6 are what you need before real users.

Once step 1 is done, `release/create-and-deploy-release.sh` runs steps 2 and 3 as a single command
if you would rather not do them separately. It needs the `FLUID_DIR` environment variable set (see
below) and a real commit SHA rather than a branch name — resolve one with `git rev-parse`. Also
sign in to the build registry first: this step pushes freshly built images, and an expired ACR
login is a common cause of a failed push partway through the build.

```bash
az acr login -n <buildAcr.name from your parameters file>
git rev-parse origin/main
FLUID_DIR=/path/to/your/FluidFramework/clone ACR_LOGIN_SERVER=<buildAcr.name>.azurecr.io \
  ./release/create-and-deploy-release.sh <sha-from-git-rev-parse> <release-id>
```

## What each folder is

**[release/](./release/README.md)** — Creates immutable release bundles under
`release-artifacts/<release-id>/`. A bundle pins the FluidFramework source revision and the built
image digests, so the same bundle always deploys the same thing. `azure/deploy.sh` refuses to run
without one.

Both this step and the deployment build from a local [FluidFramework](https://github.com/microsoft/FluidFramework)
clone, which you provide. Use one clone for both, but note they reference it differently: the
release scripts read the `FLUID_DIR` environment variable, while the deployment reads
`fluidRepoDir` from the parameters file. Point both at the same directory, and use a clone you are
happy to have checked out to an arbitrary commit.

**[azure/](./azure/README.md)** — The deployment itself. One JSON parameters file holds everything
you customize; `deploy.sh` creates the resource group, network, registries, AKS cluster, Key Vault,
Cosmos DB, Redis, Storage, Event Hubs, and Front Door, then installs Routerlicious. It can run all
at once or phase by phase, and is safe to re-run after a failure.

**[deploy-validate/](./deploy-validate/README.md)** — Proves a live deployment actually works for a
real client, not just that the pods are running. Connects two Fluid clients, creates and attaches a
document, exchanges real-time operations, cold-loads it in the second client, and checks both
appear in the audience. Runs with locally signed tokens by default, or against the deployed token
service with `--token-service`.

**[tenant-admin/](./tenant-admin/README.md)** — Tenant lifecycle CLI: create, list, rotate keys,
delete. Each tenant gets its own signing keys and its own snapshot repository, and tokens signed
for one tenant are rejected for another. Runs inside the cluster, because the tenant manager has no
authentication of its own and must never be exposed.

**[token-service/](./token-service/README.md)** — An optional, deployable reference token service.
It authenticates end users with Microsoft Entra ID and issues short-lived Fluid tokens signed with
your tenant key, so the key never reaches a client. Deployed separately from the main script —
many teams will front Fluid with a backend they already run instead.

**`release-artifacts/`** — Where release bundles land. Generated, not edited by hand.

## Reference documents

| Document | What it covers |
| -------- | -------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The design: resource-group topology, component choices and why, identity model, capacity sizing, open decisions |
| [LICENSE](../../LICENSE) | MIT |

## Before production

This is a reference deployment. Read [ARCHITECTURE.md](./ARCHITECTURE.md) — particularly its
non-goals and open-items register — before putting real users on it. The areas that need your own
decisions are identity and authorization, high-availability topology, backup and restore, capacity
validation under real load, and a supported Fluid client-version matrix.

## License

[MIT](../../LICENSE).

Third-party components carry their own terms. The ordering backend is Azure Event Hubs, a managed
Azure service under your own subscription's terms; see
[ARCHITECTURE.md §7.3](./ARCHITECTURE.md).
