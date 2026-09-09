# Create target tenants

Run this phase after configuration and before `historian-gitrest-data`. It
creates each mapped self-host tenant that does not already exist. Existing
tenants are left unchanged.

The target subscription ID, resource group, AKS name, namespace, and tenant
contact are read from `configuration/parameters/data-transfer.config.json`.
The tenant mapping is read from the reviewed inventory.

## Commands

Validate configuration first:

```bash
node ../configuration/validate-config.mjs
```

Create missing target tenants only with explicit confirmation:

```bash
node tenant-creation.mjs --execute
```

`tenant-admin` returns generated keys when it creates a tenant. This script
captures and immediately discards that response: it never writes or logs keys.

## Next steps

Run `historian-gitrest-data` after this phase completes successfully.
