---
"@fluidframework/id-compressor": minor
"__section": legacy
---
Remove legacy direct ID compressor lifecycle APIs

The legacy-beta entrypoint no longer exports `createIdCompressor`, `deserializeIdCompressor`,
`serializeIdCompressor`, `createSessionId`, `IdCreationRange`, or the
`SerializedIdCompressor*` types. These APIs expose Fluid runtime implementation and persistence
details and are now internal. `IIdCompressor` and its compressed ID types remain available.
