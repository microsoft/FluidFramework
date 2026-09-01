# tenant-admin

Tenant lifecycle CLI for the self-hosted Fluid stack. Creates, inspects, rotates keys, and
deletes tenants in a running deployment.

The stack starts with a single default tenant (`fluid`), created by `azure/deploy.sh` through
this same tool. This tool adds the rest of the lifecycle so a self-host operator can run more than
one tenant -- for example one per application, per environment, or per customer of their own.

- **Operators** should use [`tenant-admin.sh`](./tenant-admin.sh), which runs
  this CLI inside the cluster.
- **This directory** is the implementation, and can also be run directly (see
  [Running the CLI directly](#running-the-cli-directly)).

---

## Prerequisites

`tenant-admin.sh` runs the CLI **inside** your cluster, in a short-lived Pod built from the
routerlicious image that is already deployed. Nothing is built or installed into the cluster, and
you do not need Node.js locally — the only requirements are a shell, three CLI tools, and access
to the AKS cluster.

### 1. A bash shell

| OS            | What to use                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| macOS / Linux | The system shell. Nothing to install.                                                                                 |
| Windows       | **Git Bash** (ships with [Git for Windows](https://gitforwindows.org/)). PowerShell and `cmd` cannot run `.sh` files. |

WSL also works and behaves like Linux. On Git Bash the script runs as-is: it needs only bash 3.2+
features, and `.gitattributes` keeps `*.sh` checked out with LF endings so the shebang stays
valid.

### 2. Required tools

`az`, `jq`, and `kubectl` must be on your `PATH`. The script checks for all three up front and
exits with a clear error if any is missing.

**macOS** ([Homebrew](https://brew.sh/)):

```bash
brew install azure-cli jq kubectl
```

**Windows** ([winget](https://learn.microsoft.com/windows/package-manager/winget/), run in
PowerShell or `cmd`, then use Git Bash for the script itself):

```powershell
winget install Microsoft.AzureCLI
winget install jqlang.jq
winget install Kubernetes.kubectl
winget install Git.Git          # provides Git Bash, if you don't already have it
```

> **Windows note:** `jq` is **not** bundled with Git Bash and is the one dependency people
> usually miss — install it explicitly. `az` and `kubectl` install as native Windows binaries and
> are found by Git Bash automatically. Open a **new** Git Bash window after installing so the
> updated `PATH` is picked up.

**Linux** (Debian/Ubuntu):

```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
sudo apt-get install -y jq
sudo az aks install-cli          # or: sudo apt-get install -y kubectl
```

Verify all three:

```bash
az version && jq --version && kubectl version --client
```

### 3. Azure access

```bash
az login
```

Your account needs, on the AKS cluster:

- **Azure Kubernetes Service Cluster User Role** (or higher) — this is what allows
  `az aks get-credentials`, which the script calls to fetch credentials into a temporary,
  isolated kubeconfig. **Your own `kubectl` context is never modified.**
- Permission within the cluster to create, wait for, execute commands in, and delete a Pod; to
  create and delete a ConfigMap; and to read Deployments, in the target namespace (`default`
  unless you pass `--namespace`). In Kubernetes RBAC terms, command execution requires the
  `create` verb on the `pods/exec` subresource.

Cluster access **is** the authorization boundary for tenant management — see
[Security model](#security-model).

### 4. A deployment parameters file

The script reads three values from `azure/deploy.parameters.json` (the same file
`azure/deploy.sh` uses; it is gitignored):

| Key              | Used for                   |
| ---------------- | -------------------------- |
| `subscriptionId` | selecting the subscription |
| `resourceGroup`  | locating the cluster       |
| `aks.name`       | locating the cluster       |

If you deployed with `azure/deploy.sh` you already have this file. Otherwise copy
`azure/deploy.parameters.example.json` and fill in those three keys — the rest are only needed by
the deployment script. Point at a different file with `--params <path>`.

### 5. A running deployment

The AKS cluster must be **running** (not stopped) and the Routerlicious Helm release installed —
the script reads the container image from the `fluid-riddler` Deployment. If the cluster is
stopped, `az aks start -g <rg> -n <aks>` first.

### Checking your setup

```bash
./tenant-admin.sh help    # no cluster or Azure access needed
./tenant-admin.sh list    # exercises the full path: Azure -> AKS -> in-cluster Pod
```

`help` is answered locally, so it is a quick way to confirm the shell and script work — useful as
a first smoke test on Windows.

### Contributing to this tool

Only needed if you are modifying `tenant-admin` itself, not to run it:

- **Node.js 18+** to run the CLI directly or the test suite (`npm test`). The test suite needs no
  cluster and no Azure access; it runs against in-process stubs.

---

## Commands

```
create <tenantId> --contact <email>        Provision storage, then register the tenant
get <tenantId>                             Show a tenant's configuration
list [--include-disabled]                  List tenants
get-key <tenantId> [--key key1|key2]       PRIVILEGED. Print the tenant's signing keys
rotate <tenantId> --key key1|key2          PRIVILEGED. Rotate one key
set-contact <tenantId> --contact <email>   Update the tenant admin contact
delete <tenantId> [--purge-in-days N | --purge-now]
                                           Soft-delete by default
help                                       Usage
```

Run `./tenant-admin.sh help` for the full option list.

### Reading a key

`get-key` returns both keys by default:

```bash
$ ./tenant-admin.sh get-key contoso
{ "key1": "<32 hex chars>", "key2": "<32 hex chars>" }
```

Pass `--key key1` or `--key key2` to return just one — handy for scripting, and for not putting
the key you did not ask for on screen:

```bash
$ ./tenant-admin.sh get-key contoso --key key1
{ "key1": "<32 hex chars>" }

# feed one key straight into a token service
$ ./tenant-admin.sh get-key contoso --key key2 | jq -r .key2
```

Riddler always returns both keys, so `--key` filters the response rather than making a narrower
request.

### Key rotation

Each tenant has two shared keys, so rotation is zero-downtime if you move one at a time:

```bash
./tenant-admin.sh rotate contoso --key key2   # key1 tokens still valid
# roll your token service onto the new key2, confirm traffic is healthy
./tenant-admin.sh rotate contoso --key key1   # key2 tokens still valid
```

#### The in-use key check

Rotating the key your token service is _currently_ signing with will cause downtime. Riddler
invalidates the old key the moment it rotates, so every token minted with that key is rejected
on its next validation or reconnect until the new value reaches Key Vault. The rotation itself
succeeds and reports nothing wrong — the damage only appears when clients try to connect.

`rotate` therefore checks first. When the token service is deployed, it keeps each tenant's key in
a Key Vault secret named `fluid-tenant-key-<tenantId>`. If the key you asked to rotate is the value
of that secret, the command refuses:

```
$ ./tenant-admin.sh rotate contoso --key key1
ERROR: Refusing to rotate key1 for tenant "contoso": it is currently the same key stored in
secret "fluid-tenant-key-contoso" in Key Vault "my-fluid-kv", which the token-minting Function
App reads to sign tokens.
  Rotating it now BREAKS token minting for "contoso" -- riddler invalidates the old key
  immediately, so every token the Function App mints is rejected until the newly rotated key is
  written to that secret.
  Rotate without downtime instead: rotate the other key first ("rotate contoso --key key2"),
  write that new value to "fluid-tenant-key-contoso", confirm minting is healthy, then come back
  and rotate key1.
  Pass --force to override this check and rotate anyway (update the secret immediately
  afterwards to restore token minting).
```

The full safe sequence is then:

```bash
(
  NEW_KEY="$(./tenant-admin.sh rotate contoso --key key2 | jq -r '.keys.key2')"
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  chmod 600 "$KEY_FILE"
  printf '%s' "$NEW_KEY" > "$KEY_FILE"
  unset NEW_KEY
  az keyvault secret set --vault-name <kv> \
    --name fluid-tenant-key-contoso --file "$KEY_FILE" --encoding utf-8
)
# restart the Function App or wait for its Key Vault reference to refresh
# confirm minting is healthy
./tenant-admin.sh rotate contoso --key key1                  # key2 now signs tokens
```

The check is skipped, and says so, when there is nothing to protect: no `keyVault.name` in the
parameters file, or no secret for that tenant (so no token service is using its key). It
**fails closed** if the vault exists but its secret cannot be read — rotating blind is the
dangerous outcome — and tells you to grant `Key Vault Secrets User` or pass `--force`.

**The read happens inside the cluster, and the vault is never opened.** Key Vault has public
network access disabled and is reachable only through its private endpoint in the AKS VNet, so an
operator workstation cannot read it at all. Rather than flip public access on for the read and
back off afterwards — which would briefly expose the vault to the internet on every rotation —
the Pod that already runs `tenant-admin` does the read itself:

- the Pod runs as the `fluid-workload-identity` ServiceAccount and carries the
  `azure.workload.identity/use: "true"` label, so the AKS webhook injects a projected federated
  token;
- [`src/keyVaultClient.js`](./src/keyVaultClient.js) exchanges that token for an Entra token
  scoped to the Key Vault data plane and issues a plain `GET /secrets/<name>` over the private
  endpoint;
- that identity holds **Key Vault Secrets User** on the vault, granted by `azure/deploy.sh`
  (`phase8_keyvault`) — the same identity and role every application pod already uses.

Only the vault _name_ is passed into the Pod. The secret never leaves the cluster, and
`tenant-admin.sh` makes no `az keyvault` calls at all. It is hand-rolled against the REST API
rather than using `@azure/identity`, because this package ships as bare files mounted from a
ConfigMap with no `node_modules` (see [`test/deployedLayout.test.js`](./test/deployedLayout.test.js)).

Because the wrapper runs the CLI with `--json`, the outcome of the check travels back over the
`kubectl exec` stream as `keyVaultCheck` (`performed`, `skipped-no-secret`, `skipped-no-vault`,
`skipped-forced`), and the wrapper renders it for you. The result is not read from Pod logs.

Running `bin/tenant-admin.js` directly, outside the cluster, skips the check: there is no
workload identity to authenticate with, and no `--keyvault-name` is supplied.

### Deletion

`delete` performs a **soft** delete by default: riddler flags the tenant document `disabled: true`
and keeps it, and invalidates the cached keys. `--purge-now` removes the document outright.

A soft-deleted tenant is hidden from `get` and `list` (pass `--include-disabled` to `list` to see
it) but **still occupies its tenant ID**. There is no undelete: to reuse the ID, purge it first
with `delete <tenantId> --purge-now`. `create` detects this case and says so rather than reporting
a bare "already exists" for an ID nothing else can see.

Neither removes the tenant's gitrest repository — **gitrest exposes no delete-repository route**.
Reclaiming that space is a manual operation on the snapshot volume:

```bash
kubectl exec deploy/gitrest -- rm -rf /home/node/documents/<owner>/<tenantId>
```

---

## Security model

**Riddler has no authentication.** Any caller that can reach the riddler Service can enumerate
tenants and read every tenant's plaintext signing keys via `GET /api/tenants/:id/keys`. This is a
property of the upstream Routerlicious service, not of this tool.

The mitigations this stack relies on:

- riddler is a **ClusterIP Service with no Ingress**. Do not expose it.
- `tenant-admin.sh` runs the CLI **inside the cluster** in a short-lived Pod, so no port
  needs opening.
- The effective authorization boundary is therefore **Azure RBAC on the AKS cluster resource** —
  whoever can obtain cluster credentials can manage tenants.

That is a deliberate fit for the self-host model, where the operator deploying the stack is the
same person creating tenants. It is **not** per-user authorization, and `createdBy` is a
self-asserted audit breadcrumb (taken from the signed-in Azure CLI account), not an authenticated
claim.

If tenant management ever needs delegating to someone who should not own the cluster, put an
authenticated service in front of riddler rather than exposing it — one that authenticates the
caller, authorizes the requested operation, and then calls riddler on their behalf.
[`src/tenantManager.js`](./src/tenantManager.js) deliberately contains no transport or CLI
concerns so it can be reused unchanged by such a service.

### Key durability

Riddler generates tenant keys; its API has **no parameter for supplying one**. The generated key
is stored in the operations database in **plaintext** — the stack applies no key-encryption key,
because the upstream `SecretManager` implementation is a pass-through stub.

For tenants created by this tool, the database is the source of truth:

- nothing re-upserts or resets them, so their keys survive Pod restarts, node reboots, and
  cluster stop/start;
- riddler is the only service that writes tenant documents at all;
- `get-key <tenantId>` re-reads a key on demand, which is better than a mirrored copy that has to
  be kept in sync through every rotation.

The optional token service copies its currently active signing key to Key Vault. That is an
operational copy for token minting, not an automatically synchronized durable backup; follow the
rotation procedure above to keep it aligned with riddler.

Errors redact key material before it can reach a log (see `redactSecrets` in
[`src/httpClient.js`](./src/httpClient.js)).

`create`, `get-key`, and `rotate` still return key material to the requesting operator. The
wrapper starts a silent short-lived Pod and runs the CLI through `kubectl exec`, so that result is
streamed directly to the requester's terminal rather than written to the Pod's stdout/stderr.
Consequently the key is not present in the container runtime log and is not collected by
Container Insights, Fluent Bit, or another Kubernetes log shipper. The operator must still avoid
redirecting the result to an insecure file or allowing terminal/session recording to capture it.

### Encrypting tenant keys at rest

Customers that require tenant-key encryption should implement FluidFramework's
[`ISecretManager`](https://github.com/microsoft/FluidFramework/blob/e4c8cf54fcb31fce8bb704237b71a7c1dab66afc/server/routerlicious/packages/services-core/src/secretManager.ts)
using a key-encryption key and key store appropriate for their environment. Use a
FluidFramework server release that includes
[microsoft/FluidFramework#27871](https://github.com/microsoft/FluidFramework/pull/27871), which
allows that implementation to be supplied as `secretManager` through
`IRiddlerResourcesCustomizations`; `server_v7.0.1` predates this support. Until such a release is
available, the enabling commit can be pinned explicitly.

Build the custom implementation into the riddler image and pass it to
`RiddlerResourcesFactory.create` through `IRiddlerResourcesCustomizations`. Once encryption is
actually enabled, stop tenant-admin's post-create cleanup from removing riddler's
`customData.encryptionKeyVersion` field, and update the related tests and documentation. Existing
plaintext tenant records must also be migrated, or the custom manager must remain
backward-compatible with them, before the encrypted implementation is enabled.

### Key length

Riddler generates 16-byte keys, rendered as 32 hex characters, for every tenant -- including
`fluid`, which is created through this same tool. Key generation happens inside riddler and no
API accepts a caller-supplied key, so this is not something the CLI can influence.

---

## The `fluid` tenant

`fluid` is the default tenant this stack starts with, but it is not special: `azure/deploy.sh`
creates it the exact same way as any other tenant -- via `tenant-admin create fluid --contact
...` (see `phase5_bootstrap_tenant`), right after the Helm release comes up. `get`, `list`,
`get-key`, `set-contact`, `rotate`, and `delete` all work on it exactly like any other
tenant.

> **Do not add tenants to the Helm `riddler.tenants` values.** The chart no longer seeds any
> tenant there, by design -- a tenant listed there would be re-upserted from that static config
> on every riddler restart (wiping its key back to whatever the config says, which has no `key`
> field). Tenants --
> including `fluid` -- are meant to live only in the database, created through this tool.

Riddler is the **only** service that writes tenant documents -- alfred, nexus, deli, scribe,
scriptorium, gitrest and historian only read tenants through riddler's API. So no pod restart,
node reboot, or cluster stop/start can affect a tenant's keys; Cosmos DB is every tenant's
durable, permanent home.

---

## Fields in a tenant document

A tenant created by this tool looks like this in the operations database:

```json
{
  "_id": "contoso",
  "key": "<32 hex chars>",
  "secondaryKey": "<32 hex chars>",
  "orderer": null,
  "privateKeys": null,
  "storage": {
    "url": "http://gitrest",
    "historianUrl": "http://historian",
    "internalHistorianUrl": "http://historian",
    "owner": "fluid",
    "repository": "contoso"
  },
  "customData": {
    "tenantAdminContact": "...",
    "createdBy": "...",
    "createdAt": "...",
    "lastModifiedBy": "...",
    "lastModifiedAt": "..."
  },
  "disabled": false
}
```

Three of those look odd but are correct:

**`orderer: null`** — riddler's insert always includes this field, and it is null unless the
caller supplies an orderer. Null is the **better** value: riddler's `attachDefaultsToTenantDocument`
fills in `{ type: "kafka", url: <its configured base orderer URL> }` on every read, so a null field
tracks the deployment's configuration automatically. Storing a concrete URL instead would freeze a
value that goes stale if the deployment changes.

**`privateKeys: null`** — riddler's field for "keyless" tenants (`enablePrivateKeyAccess`). This
tool creates shared-key tenants, so it is null. There is no API to omit the field.

**`storage.owner: "fluid"`** — **not** a reference to the `fluid` tenant. It is the _owner
namespace_ in gitrest, which addresses repositories as `<owner>/<repository>`. Every tenant's
snapshots therefore live at `/home/node/documents/fluid/<tenantId>` on the snapshot volume, under
one shared namespace, with the tenant ID as the repository name. Change it with `--storage-owner`
if you want a different namespace; the default matches what the default tenant already uses so
everything stays in one place.

What you will **not** see is `customData.encryptionKeyVersion`. Riddler stamps that onto every
tenant it creates, claiming the key is encrypted under a "2022" key-encryption key. On this stack
that is false — the `SecretManager` in use is the upstream pass-through stub and the key is
plaintext — so `create` removes it rather than leave a field that misreports the security
properties of the record.

---

## Design notes

### Storage is provisioned before the tenant record

`createTenant` creates the gitrest repository _first_, then registers the tenant. gitrest's
create-repository call is idempotent, so an orphaned repository from a failed run is harmless and
is reused on retry. The reverse ordering produces a tenant that authenticates but fails every
document operation, which is far harder to diagnose.

### customData is read-modify-write

Riddler's `PUT /api/tenants/:id/customData` replaces the whole object. Any update therefore reads
the current value and merges, or it would silently drop `createdBy`/`createdAt`.

### Why zero dependencies

The CLI uses only Node built-ins. That lets `tenant-admin.sh` run it inside the cluster in
the routerlicious image the stack already runs — no image to build, publish or keep in sync with
the deployed revision, no `npm install`, and no prerequisites beyond the `az` / `jq` / `kubectl`
that `azure/deploy.sh` already requires.

### Tenant ID validation

Riddler performs **no** validation: it inserts whatever string it receives as the Mongo `_id`, and
that value goes on to become a gitrest directory name and a URL path segment. IDs are therefore
constrained here to lowercase alphanumerics with internal dashes, 3–64 characters, excluding a
reserved list. IDs are lowercased; anything else invalid is rejected rather than rewritten, so the
ID you get is always the ID you asked for.

Underscores are rejected even though riddler and gitrest would accept them. The ID ends up as a
filesystem name on the snapshot volume, a URL path segment, and potentially an Azure resource name
(Key Vault object names, for instance, allow only alphanumerics and dashes). Restricting IDs to
the intersection of what all of those accept keeps one ID valid everywhere, and dashes already
cover the naming need.

---

## Running the CLI directly

Normally you do not need this — use the wrapper. Direct invocation is useful for development or
when you already have a shell inside the cluster.

```bash
# from inside the cluster (service DNS defaults apply)
node bin/tenant-admin.js create contoso --contact owner@contoso.com

# from a workstation, over port-forwards
kubectl port-forward svc/fluid-riddler 5000:80 &
kubectl port-forward svc/gitrest 5001:80 &
node bin/tenant-admin.js create contoso --contact owner@contoso.com \
  --riddler-url http://127.0.0.1:5000 \
  --gitrest-url http://127.0.0.1:5001 \
  --storage-url http://gitrest
```

`--storage-url` matters in the port-forward case: it is the gitrest URL written **into the tenant
document**, and it must stay resolvable from inside the cluster even though the CLI reached
gitrest over a forwarded local port.

---

## Tests

```bash
npm test
```

The suite runs against in-process stubs of riddler and gitrest — no cluster required. It covers
the storage-before-record ordering, duplicate handling, orphaned-repository reporting, key
rotation, customData merging, soft/hard delete semantics, id validation, secret redaction, and the
CLI's argument handling and exit codes.

`test/deployedLayout.test.js` additionally reconstructs the exact file layout the wrapper mounts
into the Pod and runs the CLI from it, so a module that only resolves thanks to `package.json` or
`node_modules` fails here rather than in the cluster. If you add a file under `src/`, that test
fails until it is added to the wrapper's mount list.
