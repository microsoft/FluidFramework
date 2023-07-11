---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
---

`OdspDocumentServiceFactory` and `OdspDocumentServiceFactoryCore` acquired a new API `getRelaySessionInfo` to surface relay session info from cache in odsp-driver package.

New interfaces `IRelaySessionAwareDriverFactory` and `IProvideSessionAwareDriverFactory` that enable using the provider pattern to discover the new API `getRelaySessionInfo` from odsp-driver-definitions package.
