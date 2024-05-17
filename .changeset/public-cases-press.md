---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/runtime-definitions": minor
---

Declarative API cleanup

Make `IDisposable` `@beta` since it's most public use is `IDevtools` which is `@beta`.
Make `IInboundSignalMessage` `@alpha` since its not used in the declarative API.

Cleanup `fluid-framework` legacy exports toi remove no longer required types.
