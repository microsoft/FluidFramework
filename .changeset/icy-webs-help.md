---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---
---
"section": deprecation
---

Removed and marked as deprecated uses of ensureNoDataModelChanges.

The function ensureNoDataModelChanges in FluidDataStoreContext and IFluidParentContext that are found in the file dataStoreContext.ts in runtime-definitions and container-runtime had been marked as [deprecated and to be removed in 2.0](https://github.com/microsoft/FluidFramework/commit/c9d156264bdfa211a3075bdf29cde442ecea234c).

The instance of ensureNoDataModelChanges in MockFluidDataStoreContext has been marked as deprecated and it is set to be removed in release 2.20.
