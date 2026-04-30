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
