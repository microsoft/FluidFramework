# Configuration

Defines the settings required to copy Azure Fluid Relay documents to
a self-hosted deployment. It maps the document inventory to the self-hosted
deployment and identifies the Azure Fluid Relay server used to retrieve each
tenant's `key2`.

## Prerequisites

- Complete the [inventory step](../inventory/README.md) and review its
  `document-inventory.json` output. Its `errors` collection must be empty.
- A deployed self-hosted environment. Record its Historian endpoint,
  subscription ID, resource group, and AKS name in the copy configuration.
- The self-hosted Alfred deployment must set `alfred.enforceServerGeneratedDocumentId`
  to `false`. When documents are copied, the existing `documentId` is used.
  The supplied Helm values include this setting.
- Install dependencies using the [copy-data prerequisites](../README.md#prerequisites).

## Commands

Create a local configuration from the template:

```bash
cp parameters/copy-data.config.example.json parameters/copy-data.config.json
chmod 600 parameters/copy-data.config.json
```

Update `parameters/copy-data.config.json` with the required information. Each
`azureFluidRelayTenants` key must match an Azure Fluid Relay tenant in the
inventory. For each tenant, specify the source Azure subscription, resource group,
and Azure Fluid Relay server using `azureFluidRelaySubscriptionId`,
`azureFluidRelayResourceGroup`, and `azureFluidRelayServerName`. To update the self-hosted tenantId, set each self-hosted `selfHostTenantId`
in the inventory file, not in this configuration. If the `selfHostTenantId` is not
configured, the existing Azure Fluid Relay tenant ID will be used.

Use HTTPS endpoints without inline credentials or query strings.
Ensure each document ID appears only once per tenant and that no two source documents map to the same destination tenant/document.

Validate the configuration:

```bash
node validate-config.mjs
```

Validation reads only local files. It does not call Azure CLI or retrieve keys.

## Next step

Run the [copy-data command](../README.md#command) to create the new
self-hosted tenants and copy the reviewed documents.
You do not need to run tenant creation separately.
For retries, follow [Retry failed documents](../README.md#retry-failed-documents).
