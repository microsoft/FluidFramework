# Copy Data

This tool is used to copy Azure Fluid Relay documents to a self-hosted deployment.
It does not remove the documents from Azure Fluid Relay.

## Prerequisites

- Node.js 22 or later.
- Azure CLI signed in to subscriptions containing the Azure Fluid Relay servers
	and self-hosted deployment:

	```bash
	az login
	az extension add --name fluid-relay
	```

- Permission to read the Azure Fluid Relay servers, retrieve each Azure Fluid
	Relay tenant's `key2`, and create tenants in the self-hosted
	deployment.
- All documents must be summarized.

## Important
Rotate both the self-hosted Fluid tenant keys and the Azure Fluid Relay tenant
key 2 after copying the data.

## Workflow

1. [Inventory Azure Fluid Relay documents](inventory/README.md): creates a
	read-only inventory of Azure Fluid Relay documents.
2. [Configuration](configuration/README.md): records the self-hosted
	deployment details and the Azure Fluid Relay-to-self-hosted tenant map
	required to copy the data.
3. [Create self-hosted tenants](tenant-creation/README.md): creates any
	self-host tenants that do not already exist.
4. [Copy documents](document-copy/README.md): copies Azure Fluid
	Relay documents to the self-host tenants.

## Command

Run only after reviewing the inventory and configuration file:

```bash
node copy-data.mjs --execute
```

Use `--config <path>` to override the default
`configuration/parameters/copy-data.config.json`.

**Rotate the Azure Fluid Relay key 2 and both self-hosted tenant keys after the documents are copied.**
