---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
---

Moves `IdCompressor` and related types from `@fluidframework/container-runtime` and `@fluidframework/runtime-definitions` into their own package, `@fluidframework/id-compressor`.
Exports from original packages have been marked as deprecated.

Additionally, marks the `IdCompressor` class as deprecated.
Consumers should use the interfaces, `IIdCompressor` and `IIdCompressorCore`, in conjunction with the factory function `createIdCompressor` instead.
