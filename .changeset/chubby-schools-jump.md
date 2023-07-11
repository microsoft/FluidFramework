---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
---

`OdspDocumentServiceFactory` and `OdspDocumentServiceFactoryCore` acquired a new API `getRelaySessionInfo` to surface relay session info from cache, and implement new interfaces `IRelaySessionAwareDriverFactory` and `IProvideSessionAwareDriverFactory` that enable using the provider pattern to discover the new API.

A new API getRelaySessionInfo to surface relay session info from cache, and providers to allow access to the new API
