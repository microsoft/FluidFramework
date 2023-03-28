---
"@fluidframework/container-runtime": major
"@fluidframework/datastore": major
"@fluidframework/garbage-collector": major
"@fluidframework/runtime-definitions": major
"@fluidframework/runtime-utils": major
"@fluidframework/test-end-to-end-tests": major
---

GC interfaces removed from runtime-definitions

The following interfaces available in `@fluidframework/runtime-definitions` are internal implementation details and have been deprecated for public use. They will be removed in an upcoming release.

-   `IGarbageCollectionNodeData`
-   `IGarbageCollectionState`
-   `IGarbageCollectionSnapshotData`
-   `IGarbageCollectionSummaryDetailsLegacy`
