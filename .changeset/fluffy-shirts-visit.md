---
"@fluidframework/container-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-utils": minor
---

Type Erase IFluidDataStoreRuntime.deltaManager

Make IFluidDataStoreRuntime.deltaManager have an opaque type.
Marks the following types which were reachable from it as alpha:

-   IConnectionDetails
-   IDeltaSender
-   IDeltaManagerEvents
-   IDeltaManager
-   IDeltaQueueEvents
-   IDeltaQueue
-   ReadOnlyInfo

As a temporary workaround, users needing access to the full delta manager API can use the `@alpha` `toDeltaManagerInternal` API to retrieve its members, but should migrate away from requiring access to those APIs.
