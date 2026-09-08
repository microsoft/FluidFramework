# Configure data transfer

This step defines the non-secret settings used by every transfer phase after
inventory. It connects a reviewed inventory to the self-hosted deployment,
maps each source Fluid tenant to a self-host tenant, and identifies the
Azure Fluid Relay server used to obtain each source tenant's `key2` at runtime.
Credentials remain outside the configuration file and must never be committed.

## Prerequisites

- Complete the [inventory step](../inventory/README.md) and review its
  `document-inventory.json` output. Its `errors` collection must be empty.
- Create the corresponding self-host tenant for every source tenant with
  [tenant-admin](../../tenant-admin/README.md), if it does not already exist.
- A deployed self-hosted Fluid environment with
  `azure/deploy.parameters.json` available locally.
- Azure CLI signed in to the source subscription with permission to retrieve
  keys for each source Azure Fluid Relay server:

  ```bash
  az login
  az extension add --name fluid-relay
  ```

## Commands

Create a local configuration from the non-sensitive template:

```bash
cp data-transfer.config.example.json data-transfer.config.json
chmod 600 data-transfer.config.json
```

Edit `data-transfer.config.json` to replace every placeholder. Each
`sourceTenants` key must match a source tenant in the inventory. Set
`sourceResourceGroup` and `sourceServerName` to the source Azure Fluid Relay
server that hosts the tenant. Set each target `selfHostTenantId` in the
inventory file, not in this configuration. If it is omitted, the source AFR
tenant ID is used and configuration validation prints a warning.

Later transfer tools retrieve only `key2` with Azure CLI and use it only for
the document operation that needs it. Do not run `az fluid-relay server
list-key` manually: it writes the key to standard output. The shared
`credentials.mjs` utility requests only `key2`, does not log Azure CLI output
or errors, never writes the key to disk, and drops its local in-memory
reference as soon as the operation completes. Callers must not retain the key
or include it in logs, errors, results, or telemetry.

Before running a later phase, verify its non-secret inputs are available:

```bash
node validate-config.mjs
```

Validation reads only local files. It does not call Azure CLI or retrieve keys.

## Next steps

Run the `historian-gitrest-data` phase after validating this configuration. It
will use the reviewed inventory and this file to replicate each selected
document's historian/gitrest repository to the mapped self-host tenant. Rotate
both source and target tenant keys after migration.
