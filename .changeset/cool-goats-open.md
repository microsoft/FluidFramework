---
"@fluidframework/azure-client": minor
"@fluidframework/container-runtime": minor
"@fluidframework/core-interfaces": minor
"@fluid-experimental/odsp-client": minor
"@fluidframework/telemetry-utils": minor
"@fluid-experimental/tree2": minor
---

Move config base types from telemetry-utils to core-interfaces

The types ConfigTypes, and IConfigProviderBase have been deprecated in the @fluidframework/telemetry-utils and copied to the @fluidframework/core-interfaces. Please update your reference to use these types from @fluidframework/core-interfaces.
