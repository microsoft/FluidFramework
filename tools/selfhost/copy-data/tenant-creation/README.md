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

Prefer the [combined copy-data command](../README.md#command), which runs deployment preflight before tenant creation and document copy.
Use the following commands only when troubleshooting this individual stage.

Validate the configuration:

```bash
node ../configuration/validate-config.mjs
```

Create the new self-hosted tenants:

```bash
node tenant-creation.mjs --execute
```

## Next step

Run [document copy](../document-copy/README.md) to create the reviewed
documents in the mapped self-hosted tenants.
