# Self-host Fluid Framework on Azure

Run Fluid Framework as a service you operate yourself, in your own Azure subscription.

This repository deploys the full, multi-service Routerlicious topology onto Azure Kubernetes
Service, with Azure Event Hubs for ordering, Azure Cosmos DB for MongoDB for document data and
operations, Azure Managed Redis, and Azure Files for snapshots. You own every resource it
creates.

If Azure Managed Redis cannot be created in your region, you can explicitly select
[Azure Cache for Redis as a temporary fallback](./azure/README.md#azure-cache-for-redis-fallback).
The deployment also includes a [maintenance-window migration script](./azure/README.md#migrating-the-fallback-to-azure-managed-redis)
to switch to Managed Redis later without deleting the old cache automatically.

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
| 7 | **Migrate existing Azure Fluid Relay documents** — optional; inventories selected tenants, creates destination tenants, and copies reviewed documents | [copy-data/](./copy-data/README.md) |

Steps 1–4 get you a running, verified deployment.
For new applications, continue with steps 5–6.
For migration, step 7 creates missing destination tenants, so you do not need to create those same tenants manually in step 5.
Configure a token backend before admitting real users.

### Recommended build and deployment command

After step 1, use `release/create-and-deploy-release.sh` to complete steps 2 and 3 together.
Run the following from `tools/selfhost`.
Set `fluidRepoDir` in your parameters file to a **separate, clean Fluid Framework checkout outside this repository**.
The scripts check out the release's pinned commit there; do not use a checkout with your own work.
The combined command defaults `FLUID_DIR` to `fluidRepoDir`; an explicit `FLUID_DIR` overrides the build checkout.

Select a reviewed tag or full commit SHA, not a branch name:

- **Use an existing release tag** — search [the release list](https://github.com/microsoft/FluidFramework/releases?page=1)
  for one (for example, `server_v7.0.1`).
- **Resolve a SHA from a branch** with `git rev-parse`, e.g. `git rev-parse origin/main`.

```bash
./release/create-and-deploy-release.sh <tag-or-sha> <release-id>
```

For example, `<release-id>` can be `r0.1.0`; it names an immutable local bundle.
The command checks your configuration before building, creates/reuses and logs into the build ACR, generates the bundle, and runs deployment with its own preflight checks.
Deployment creates/reuses and logs into the deploy ACR.
You do **not** need to log into registries that do not exist yet.
You do not need to run preflight separately.

If a complete bundle was generated but deployment failed, fix the configuration and reuse it without rebuilding:

```bash
./release/create-and-deploy-release.sh r0.1.0 --skip-build
```

If generation itself failed, its temporary local artifacts are removed; retry the original command with the same release ID.
Only use `--skip-preflight` deliberately after validating your configuration; it bypasses cloud checks, not local input validation.
For advanced use of an existing build registry, set `ACR_LOGIN_SERVER` and authenticate to that registry yourself.
See [registry authentication](./release/README.md#registry-authentication) for Docker Hub credentials, which are separate from ACR authentication.

## What each folder is

**[release/](./release/README.md)** — Creates immutable release bundles under
`release-artifacts/<release-id>/`. A bundle pins the FluidFramework source revision and the built
image digests, so the same bundle always deploys the same thing. `azure/deploy.sh` refuses to run
without one.

Both this step and the deployment build from a local [FluidFramework](https://github.com/microsoft/FluidFramework)
clone, which you provide.
The combined command defaults its build checkout to `fluidRepoDir`; standalone release scripts require `FLUID_DIR` when building.
The deployment reads `fluidRepoDir` from the parameters file.
Point these at a separate clone that can be checked out to the pinned commit.

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

**[copy-data/](./copy-data/README.md)** — Creates tenants and copies document data from Azure Fluid
Relay to a self-hosted deployment.

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
