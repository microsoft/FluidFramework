# Create Self-Hosted Tenants

Creates each self-hosted tenant that does not already exist.
Existing tenants are left unchanged.

This uses the self-host subscription ID, resource group, AKS name, namespace,
and contact information from the configuration file.

The inventory maps each Azure Fluid Relay tenant to its corresponding self-hosted
tenant.

## Prerequisites

- Complete the [inventory step](../inventory/README.md) and review its
	`document-inventory.json` output. Its `errors` collection must be empty.
- The Azure Fluid Relay tenant's `selfHostTenantId` can be updated in
	`document-inventory.json` to use a unique self-hosted tenant ID.
- Complete the [configuration step](../configuration/README.md) with the
	self-hosted deployment details and tenant map.

## Commands

Validate the configuration:

```bash
node ../configuration/validate-config.mjs
```

Create the new self-hosted tenants:

```bash
node tenant-creation.mjs --execute
```

When `tenant-admin` creates a tenant, it returns generated keys. This script
immediately discards the response and never writes or logs the keys. Rotating
the tenant keys is recommended.

## Next step

Run [document copy](../document-transfer/README.md) to create the reviewed
documents in the mapped self-hosted tenants.
