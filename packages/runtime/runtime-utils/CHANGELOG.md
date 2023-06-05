# @fluidframework/runtime-utils

## 2.0.0-internal.5.0.0

### Major Changes

-   The `@fluidframework/garbage-collector` package was deprecated in version 2.0.0-internal.4.1.0. [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)
    It has now been removed with the following functions, interfaces, and types in it.

    -   `cloneGCData`
    -   `concatGarbageCollectionData`
    -   `concatGarbageCollectionStates`
    -   `GCDataBuilder`
    -   `getGCDataFromSnapshot`
    -   `IGCResult`
    -   `removeRouteFromAllNodes`
    -   `runGarbageCollection`
    -   `trimLeadingAndTrailingSlashes`
    -   `trimLeadingSlashes`
    -   `trimTrailingSlashes`
    -   `unpackChildNodesGCDetails`
    -   `unpackChildNodesUsedRoutes`

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

### Minor Changes

-   GC interfaces removed from runtime-definitions ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

    The following interfaces available in `@fluidframework/runtime-definitions` are internal implementation details and have been deprecated for public use. They will be removed in an upcoming release.

    -   `IGarbageCollectionNodeData`
    -   `IGarbageCollectionState`
    -   `IGarbageCollectionSnapshotData`
    -   `IGarbageCollectionSummaryDetailsLegacy`

-   @fluidframework/garbage-collector deprecated ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

    The `@fluidframework/garbage-collector` package is deprecated with the following functions, interfaces, and types in it.
    These are internal implementation details and have been deprecated for public use. They will be removed in an upcoming
    release.

    -   `cloneGCData`
    -   `concatGarbageCollectionData`
    -   `concatGarbageCollectionStates`
    -   `GCDataBuilder`
    -   `getGCDataFromSnapshot`
    -   `IGCResult`
    -   `removeRouteFromAllNodes`
    -   `runGarbageCollection`
    -   `trimLeadingAndTrailingSlashes`
    -   `trimLeadingSlashes`
    -   `trimTrailingSlashes`
    -   `unpackChildNodesGCDetails`
    -   `unpackChildNodesUsedRoutes`
