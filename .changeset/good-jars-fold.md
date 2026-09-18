---
"@fluidframework/runtime-definitions": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/shared-object-base": minor
"fluid-framework": minor
"__section": deprecation
---
Expose a dedicated index for messages within runtime batches

Data store runtime and shared object op events now expose `ISequencedRuntimeMessage`, which adds the optional `indexInBatch` property. Use this property instead of `clientSequenceNumber` when ordering logical messages within a runtime batch. Older runtime package boundaries may omit the property; code that only needs a local ordering key can fall back to `clientSequenceNumber`. The runtime-layer use of `clientSequenceNumber` is deprecated, while protocol-level client sequence numbers remain unchanged.
