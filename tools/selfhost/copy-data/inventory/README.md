# Inventory Azure Fluid Relay Documents

This creates an inventory of the Azure Fluid Relay documents in the signed-in
Azure CLI account. The inventory file is used to copy the documents from Azure
Fluid Relay to a self-hosted server.

## Prerequisites

- Read access to the Azure subscription or resource group containing the Azure
  Fluid Relay servers.

## Commands

Run from this directory:

```bash
node inventory.mjs
```

The command creates `document-inventory.json`. The file is
gitignored and is created with owner-only permissions.

The scope of the inventory can be limited to a resource group, subscription, or Fluid tenant:

```bash
node inventory.mjs --resource-group <resource-group>
node inventory.mjs --subscription <subscription-id-or-name>
node inventory.mjs --tenant-id <frs-tenant-id>
```

Use a different `document-inventory.json` output location:

```bash
node inventory.mjs --output <path-to-inventory.json>
```

For the complete option list:

```bash
node inventory.mjs --help
```

## Next step

Review `document-inventory.json`, including its `errors` collection. Resolve
failed server reads and rerun the inventory until it contains only the intended
documents before continuing with [configuration](../configuration/README.md).
