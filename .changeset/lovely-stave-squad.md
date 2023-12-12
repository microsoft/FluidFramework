---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
---

container-runtime/runtime-definitions: `IdCompressor` and related types deprecated

`IdCompressor` and related types from the @fluidframework/container-runtime and @fluidframework/runtime-definitions
packages have been deprecated. They can now be found in a new package, @fluidframework/id-compressor.

The `IdCompressor` class is deprecated even in the new package. Consumers should use the interfaces, `IIdCompressor` and
`IIdCompressorCore`, in conjunction with the factory function `createIdCompressor` instead.
