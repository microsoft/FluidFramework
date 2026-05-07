---
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"__section": feature
---
Add a new free function `captureFullContainerState` for serializing a container without loading it, for rehydrating into a future session.

`captureFullContainerState` produces a self-contained pending-state artifact using only driver-level services (no runtime, no live container). The output is suitable for handing to `loadExistingContainer` or `loadFrozenContainerFromPendingState` later.

This change extends the serialized `IPendingContainerState` wire format with an optional `attachmentBlobContents` field carrying base64-encoded attachment-blob bytes keyed by storage id. The new field is required by `captureFullContainerState` so attachment blobs can resolve in offline / frozen-load scenarios; an older loader receiving newer pending state silently ignores it and its attachment-blob handles will fail to resolve when live storage is unreachable.
