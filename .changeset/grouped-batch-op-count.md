---
"@fluidframework/container-runtime": minor
"__section": feature
---
Add groupedOpCount to grouped batch metadata

A new `groupedOpCount` field on the metadata of grouped batch envelope messages exposes the number of inner ops in the batch. This lets wire-level consumers record batch sizes in telemetry without parsing the grouped batch contents.

The field is set on:
- The single envelope produced by grouping a batch (`OpGroupingManager.groupBatch`).
- The empty-grouped-batch placeholder used when a resubmitted batch becomes empty (`OpGroupingManager.createEmptyGroupedBatch`, value `0`).
- The final chunk of a chunked grouped batch (`OpSplitter.splitSingletonBatchMessage`), so the count survives chunking.

Compression preserves the metadata as-is, so compressed grouped batches carry the field through unchanged.

The new field is optional and additive; old runtimes loading a new pending-state stash containing `groupedOpCount` will safely ignore it, and new runtimes loading an old stash without `groupedOpCount` are unaffected. The field is intentionally advisory-only — it is consumed by off-runtime telemetry, and the runtime does not validate that an inbound value matches the batch's actual inner op count.
