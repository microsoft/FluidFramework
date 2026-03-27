---
"@fluidframework/id-compressor": minor
"__section": deprecation
---

Deprecated `IIdCompressorCore` interface

The `IIdCompressorCore` interface is deprecated and will be removed from the public API surface in 2.100.0. This also affects the return types of `createIdCompressor` and `deserializeIdCompressor`, which currently return `IIdCompressor & IIdCompressorCore` but will be narrowed to `IIdCompressor`.

#### Migration

- **`serialize()`**: Use the new `serializeIdCompressor(compressor, withSession)` free function instead of calling `compressor.serialize(withSession)` directly.
- **`takeNextCreationRange()`, `takeUnfinalizedCreationRange()`, `finalizeCreationRange()`, `beginGhostSession()`**: These are internal runtime operations that should not be called by external consumers. If you depend on these APIs, please file an issue on the FluidFramework repository describing your use case.
- **Return types of `createIdCompressor` / `deserializeIdCompressor`**: Stop relying on the `IIdCompressorCore` portion of the intersection type. Type your variables as `IIdCompressor` instead of `IIdCompressor & IIdCompressorCore`.
