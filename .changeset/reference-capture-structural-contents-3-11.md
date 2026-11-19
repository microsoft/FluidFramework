---
"@fluidframework/container-loader": minor
"__section": legacy
---
Reference capture includes structural contents for offline loading

The existing `blobCaptureMode: "reference"` option of `captureFullContainerState` now includes the same structural snapshot payloads as inline capture, while continuing to omit attachment payloads.
For compatible resolved URLs, this enables offline structural loading with `loadFrozenContainerFromPendingState`; reading an omitted attachment still requires live storage.
Reference captures are larger and may require more storage reads than before.
Previously captured reference-only state still requires online driver wiring.

This backport retains the existing UTF-8 string encoding and does not provide lossless capture of arbitrary binary structural blobs.
Default inline capture, ordinary pending-state serialization, and detached serialization are unchanged by this update.
