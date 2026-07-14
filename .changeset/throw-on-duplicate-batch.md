---
"@fluidframework/container-runtime": patch
"fluid-framework": patch
"__section": fix
---

Throw DataCorruptionError for meaningful duplicate batch detections

Previously, all detected duplicate batches were only logged via the `DuplicateBatch` telemetry event, and the corresponding `DataCorruptionError` was never thrown. This was a temporary mitigation for a service-side bug that could redeliver batches.

Now, the error is thrown when either the incoming batch or the previously-seen batch has an explicit `batchId` (i.e. the batch was resubmitted, as opposed to a fresh batch whose `batchId` is derived from `clientId` and `batchStartCsn`). This distinguishes genuine duplicate-batch scenarios (e.g. container forking) from the known service-outage artifact, which only ever produces duplicates without explicit batch ids. Duplicates without an explicit `batchId` on either side continue to be log-only.
