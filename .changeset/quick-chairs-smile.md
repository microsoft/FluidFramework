---
"@fluidframework/azure-client": minor
---
---
"section": deprecation
---

ITokenClaims and ScopeType types are now deprecated

The `ITokenClaims` and `ScopeType` types in `@fluidframework/azure-client` are now deprecated. These were isolated types
re-exported for convenience but they do not directly interact with typical azure-client APIs.

See [issue #23702](https://github.com/microsoft/FluidFramework/issues/23702) for details and alternatives.
