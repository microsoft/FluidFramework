# Document Copy

Reads each selected document's latest summary from Azure Fluid Relay and creates
it through the self-hosted Alfred public API, requesting the same
document ID.

The self-hosted service writes its own Gitrest summary, document metadata,
operations state, and checkpoints. The copy does not copy Git objects or
refs, write Cosmos DB records, or copy Azure Fluid Relay deli/scribe state. If
the self-hosted service cannot preserve the requested document ID, the results
file records the Azure Fluid Relay-to-self-hosted ID mapping.

## Prerequisites

- Complete the [inventory step](../inventory/README.md) and review its
	`document-inventory.json` output. Its `errors` collection must be empty.
- Complete the [configuration step](../configuration/README.md) and provide the
	self-hosted tenant mapping for every document selected for copying.

## Commands

Validate the shared configuration before running this phase:

```bash
node ../configuration/validate-config.mjs
```

Copy documents only after review. `--execute` is required:

```bash
node copy.mjs --execute
```

Use a specific configuration file when needed:

```bash
node copy.mjs --config ../configuration/parameters/copy-data.config.json --execute
```

`azureFluidRelayEndpoint` is the Azure Fluid Relay discovery endpoint, not a
direct Historian endpoint. For each document, the tool discovers its session,
uses the returned Historian URL to read the newest summary, then submits the
application summary, sequence number, and quorum values to self-hosted Alfred.
The self-hosted document creation request asks to preserve the
Azure Fluid Relay ID. It retrieves Azure Fluid Relay and self-hosted
`key2` values only for each document operation and does not log or write either
key or its JWT.

## Next step

Validate the copied documents and rotate the Azure Fluid Relay and
self-hosted tenant keys as described in the
[copy-data workflow](../README.md#workflow).
