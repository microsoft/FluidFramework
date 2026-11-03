# Document Copy

Reads each selected document's latest summary from Azure Fluid Relay and creates
it through the self-hosted Alfred public API, requesting the same
document ID.

If the service returns a different document ID, copying fails explicitly and creation is not repeated.

If the self-hosted document already exists, the copy is skipped and recorded as a
warning instead of attempting to create it.
The existing document is not modified, verified, or repaired.
If you intend to replace it, first review and back up any destination data you need to keep.
Then manually delete the destination document and rerun the copy using a reviewed inventory containing only that document, without `--failed-only`.
For unresolved earlier create attempts, follow the [manual-review guidance](../README.md#retry-failed-documents) before attempting another copy.

## Prerequisites

- Complete the [inventory step](../inventory/README.md) and review its
	`document-inventory.json` output. Its `errors` collection must be empty.
- Complete the [configuration step](../configuration/README.md) and provide the
	self-hosted tenant mapping for every document selected for copying.
- Ensure Alfred sets `alfred.enforceServerGeneratedDocumentId` to `false`.
	The self-hosted document ID must match the requested Azure Fluid Relay ID so
	the copy tool can detect documents that were already copied.
- To copy the intended current state, stop source writes and verify an acknowledged client summary incorporates that state.
	The copy tool does not replay later operations or copy unsummarized writes.
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
direct Historian endpoint.

To [retry failed documents](../README.md#retry-failed-documents), use the same source/destination configuration and reviewed inventory:

```bash
node copy.mjs --execute --concurrency 2 --failed-only ../results/copy-data-results.json
```

To explicitly accept the application snapshot without unapplied tail operations:

```bash
node copy.mjs --execute --failed-only ../results/copy-data-results.json --ignore-logtail
```

**`--ignore-logtail` can omit recent document changes; it does not replay or recover the tail.**
Use it only if you accept losing those changes.
It does not bypass malformed summaries or overwrite existing destinations.

## Next step

Validate the copied documents and rotate the Azure Fluid Relay and
self-hosted tenant keys as described in the
[copy-data workflow](../README.md#workflow).
