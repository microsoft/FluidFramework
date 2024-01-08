# @fluidframework/runtime-utils

## 2.0.0-internal.8.0.0

### Major Changes

-   container-definitions: Fix ISnapshotTreeWithBlobContents and mark internal [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    `ISnapshotTreeWithBlobContents` is an internal type that should not be used externally. Additionally, the type didn't
    match the usage, specifically in runtime-utils where an `any` cast was used to work around undefined blobContents. The
    type has been updated to reflect that blobContents can be undefined.

-   runtime-utils: Removed requestFluidObject [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `requestFluidObject` utility has been removed. Please migrate all usage of it to the new `entryPoint` pattern.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

-   Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    This included the following changes from the protocol-definitions release:

    -   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
        submitted by clients to the server and the resulting signals sent from the server to clients.
        -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
            been added, which will be the typing for signals sent from the client to the server. Both extend a new
            ISignalMessageBase interface that contains common members.
    -   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

-   DEPRECATED: container-loader: Various request related APIs have been deprecated [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Please remove all calls to the following functions and instead use the new `entryPoint` pattern:

    -   `requestFluidObject`
    -   `requestResolvedObjectFromContainer`
    -   `getDefaultObjectFromContainer`
    -   `getObjectWithIdFromContainer`
    -   `getObjectFromContainer`

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

-   Server upgrade: dependencies on Fluid server packages updated to 2.0.1 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Dependencies on the following Fluid server package have been updated to version 2.0.1:

    -   @fluidframework/gitresources: 2.0.1
    -   @fluidframework/server-kafka-orderer: 2.0.1
    -   @fluidframework/server-lambdas: 2.0.1
    -   @fluidframework/server-lambdas-driver: 2.0.1
    -   @fluidframework/server-local-server: 2.0.1
    -   @fluidframework/server-memory-orderer: 2.0.1
    -   @fluidframework/protocol-base: 2.0.1
    -   @fluidframework/server-routerlicious: 2.0.1
    -   @fluidframework/server-routerlicious-base: 2.0.1
    -   @fluidframework/server-services: 2.0.1
    -   @fluidframework/server-services-client: 2.0.1
    -   @fluidframework/server-services-core: 2.0.1
    -   @fluidframework/server-services-ordering-kafkanode: 2.0.1
    -   @fluidframework/server-services-ordering-rdkafka: 2.0.1
    -   @fluidframework/server-services-ordering-zookeeper: 2.0.1
    -   @fluidframework/server-services-shared: 2.0.1
    -   @fluidframework/server-services-telemetry: 2.0.1
    -   @fluidframework/server-services-utils: 2.0.1
    -   @fluidframework/server-test-utils: 2.0.1
    -   tinylicious: 2.0.1

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

-   Remove packagePathToTelemetryProperty Function [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    packagePathToTelemetryProperty was previously deprecated and is now removed. Use tagCodeArtifacts instead.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

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
