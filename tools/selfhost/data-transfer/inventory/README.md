# Inventory Azure Fluid Relay documents

This is the first step for moving Azure Fluid Relay documents to a self-hosted
Fluid deployment. It queries the Azure Fluid Relay servers visible to the signed-in
Azure CLI account and writes a document inventory grouped by Fluid tenant. The
inventory records the Fluid tenant ID and document IDs required by later transfer
steps; it does not copy or modify any documents.

## Prerequisites

- Node.js 18 or later.
- Azure CLI installed and signed in:

  ```bash
  az login
  ```

- The Azure CLI Fluid Relay extension:

  ```bash
  az extension add --name fluid-relay
  ```

- Reader access to the Azure subscription or resource group containing the Azure
  Fluid Relay servers and containers being inventoried.

## Commands

Run from this directory:

```bash
node inventory.mjs
```

The command writes `document-inventory.json` beside the script. The file is
gitignored and is created with owner-only permissions.

Limit the inventory to a resource group, subscription, or Fluid tenant as needed:

```bash
node inventory.mjs --resource-group <resource-group>
node inventory.mjs --subscription <subscription-id-or-name>
node inventory.mjs --tenant-id <frs-tenant-id>
```

Use a different output location or inspect every Azure CLI invocation:

```bash
node inventory.mjs --output <path-to-inventory.json>
node inventory.mjs --verbose
```

For the complete option list:

```bash
node inventory.mjs --help
```

## Next steps

Review `document-inventory.json`, including the `errors` collection. Resolve any
failed server reads and rerun inventory until it contains the documents intended
for transfer. The next data-transfer step will consume this inventory to prepare
the corresponding self-host tenant and document migration inputs.
