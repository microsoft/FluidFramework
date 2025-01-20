---
"@fluidframework/container-runtime": minor
---
---
"section": legacy
---

Enabling Op Compression without Op Grouping is no longer supported

`IContainerRuntimeOptions.enableGroupedBatching` was deprecated in 2.12 (see [release notes](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-icontainerruntimeoptionsenablegroupedbatching-is-now-deprecated-23260)).
While this option is not yet removed (and still defaults to `true`), disabling it (by setting to `false`) is only supported
if compression is also disabled (by passing `Infinty` for `IContainerRuntimeOptions.compressionOptions.minimumBatchSizeInBytes`).
