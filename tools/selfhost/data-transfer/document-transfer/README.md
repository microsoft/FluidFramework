# Document Transfer

This combined phase uses the source session-discovery and Historian access
pattern to read each selected document's latest summary from Azure Fluid Relay.
It then creates the document through the self-hosted target's normal Alfred
public API, requesting the same document ID.

The target service writes its own Gitrest summary, document metadata,
operations state, and checkpoints. The transfer does not copy Git objects or
refs, write Cosmos DB records, or copy source deli/scribe state. If the target
cannot preserve the requested document ID, the results file records the
source-to-target ID mapping.

## Prerequisites

- Complete [inventory](../inventory/README.md) and review the inventory file.
- Complete [configuration](../configuration/README.md). Its local configuration
  must validate.
- Complete [tenant creation](../tenant-creation/README.md) so each mapped
  target tenant exists.
- Azure CLI access to the source Fluid Relay server and the self-hosted target
  deployment. Transfer tools retrieve keys only while needed and never log or
  persist them.
- A maintenance window or read-only migration cutoff so the source summary is
  stable during transfer.

## Commands

Validate the shared configuration before running this phase:

```bash
node ../configuration/validate-config.mjs
```

Transfer documents only after review. `--execute` is required:

```bash
node transfer.mjs --execute
```

Use a specific configuration file when needed:

```bash
node transfer.mjs --config ../configuration/parameters/data-transfer.config.json --execute
```

`sourceFluidRelayEndpoint` is the Azure Fluid Relay discovery endpoint, not a
direct Historian endpoint. For each document, the tool discovers its session,
uses the returned Historian URL to read the newest summary, then submits the
application summary, sequence number, and quorum values to target Alfred. The
target document creation request asks to preserve the source ID. It retrieves
source and target `key2` values only for each document operation and does not
log or write either key or its JWT.

## Next steps

Run `summary-testing` to validate each transferred target document.
**Rotate source and target tenant keys after the documents are copied.**
