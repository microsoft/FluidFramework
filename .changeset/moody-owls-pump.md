---
"@fluidframework/odsp-driver": minor
"__section": legacy
---

Move point-in-time loading to the concrete ODSP document service factory

`OdspDocumentServiceFactory` now implements `createPointInTimeDocumentService` directly as a
prototype method backed by a lazy implementation module. `OdspDocumentServiceFactoryCore` and the
local ODSP factory no longer expose the capability. Consumers that need point-in-time loading should
construct `OdspDocumentServiceFactory` directly. `getOdspPointInTimeDocumentServiceFactory` remains
as a deprecated compatibility alias.
