# Document Copy

Reads each selected document's latest summary from Azure Fluid Relay and creates
it through the self-hosted Alfred public API, requesting the same
document ID.

The self-hosted service writes its own Gitrest summary, document metadata,
operations state, and checkpoints.
The copy does not copy Git objects or refs, write Cosmos DB records, or copy Azure Fluid Relay deli/scribe state.
If the service returns a different document ID, copying fails explicitly and creation is not repeated.

If the self-hosted document already exists, the copy is skipped and recorded as a
warning instead of attempting to create it.

## Prerequisites

- Complete the [inventory step](../inventory/README.md) and review its
	`document-inventory.json` output. Its `errors` collection must be empty.
- Complete the [configuration step](../configuration/README.md) and provide the
	self-hosted tenant mapping for every document selected for copying.
- Ensure Alfred sets `alfred.enforceServerGeneratedDocumentId` to `false`.
	The self-hosted document ID must match the requested Azure Fluid Relay ID so
	the copy tool can detect documents that were already copied.
- Stop source writes and verify an acknowledged client summary incorporates the intended document state.
	The copy tool does not replay `.logTail`.
	It refuses to create a document if that tail contains application or unknown operations after the application snapshot's sequence number.
	Protocol-only summary/acknowledgment and membership traffic does not cause this refusal.
	A service summary is not proof that the application state was summarized.
	The check cannot detect writes newer than the summary being read.
- Install dependencies as described in the [copy-data prerequisites](../README.md#prerequisites).

## Commands

Prefer the [combined copy-data command](../README.md#command), which checks deployment settings before tenant creation and then runs this stage.
This individual stage also checks every Alfred replica before copying; it does not create missing tenants.

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
Azure Fluid Relay ID.
It retrieves self-hosted `key2` once per tenant, and source `key2` once per tenant only when documents need copying.
Keys remain callback-scoped; each request attempt generates a new JWT.
Read/existence JWTs are document-scoped; document creation uses the tenant-scoped token required by Alfred.
Neither keys nor JWTs are logged or written.

The [performance and recovery flags](../README.md#performance-and-recovery) work here as well:

```bash
node copy.mjs --execute --concurrency 2 --failed-only ../results/copy-data-results.json
```

Source/destination mappings are validated before network access.
Uncertain creates are not blindly retried, and existing destination state is never treated as repaired.

## Next step

Validate the copied documents and rotate the Azure Fluid Relay and
self-hosted tenant keys as described in the
[copy-data workflow](../README.md#workflow).
