---
"@fluidframework/id-compressor": minor
"__section": legacy
---

Remove IIdCompressorCore from legacy API surface

The `IIdCompressorCore` interface has been removed from the `@legacy` API surface and is now `@internal`.
This was previously deprecated in 2.92.0.

The return types of `createIdCompressor` and `deserializeIdCompressor` have been narrowed from `IIdCompressor & IIdCompressorCore` to `IIdCompressor`.

#### Migration

- **`serialize()`**:
  Use the `serializeIdCompressor(compressor, withSession)` free function instead of calling `compressor.serialize(withSession)` directly.
- **`takeNextCreationRange()`, `takeUnfinalizedCreationRange()`, `finalizeCreationRange()`, `beginGhostSession()`**:
  These are internal runtime operations that should not be called by external consumers.
  If you depend on these APIs, please file an issue on the FluidFramework repository describing your use case.
- **Return types of `createIdCompressor` / `deserializeIdCompressor`**:
  Type your variables as `IIdCompressor` rather than `IIdCompressor & IIdCompressorCore`.
