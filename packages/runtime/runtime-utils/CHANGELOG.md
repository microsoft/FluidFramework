# @fluidframework/runtime-utils

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

### Minor Changes

-   New compareFluidHandle function for comparing FluidHandles ([#22997](https://github.com/microsoft/FluidFramework/pull/22997)) [8d470085fb](https://github.com/microsoft/FluidFramework/commit/8d470085fb41a84212a993a1ebbbf903fd4f16b6)

    The new `compareFluidHandle` function has been added to allow comparing handles without having to inspect their internals.

-   The inbound and outbound properties have been removed from IDeltaManager ([#22282](https://github.com/microsoft/FluidFramework/pull/22282)) [45a57693f2](https://github.com/microsoft/FluidFramework/commit/45a57693f291e0dc5e91af7f29a9b9c8f82dfad5)

    The inbound and outbound properties were [deprecated in version 2.0.0-rc.2.0.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.0.0-rc.2.0.0.md#container-definitions-deprecate-ideltamanagerinbound-and-ideltamanageroutbound) and have been removed from `IDeltaManager`.

    `IDeltaManager.inbound` contained functionality that could break core runtime features such as summarization and processing batches if used improperly. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

    Similarly, `IDeltaManager.outbound` contained functionality that could break core runtime features such as generation of batches and chunking. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

    #### Alternatives

    -   Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
    -   Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
    -   Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

### Minor Changes

-   New `isFluidHandle` type guard to check if an object is an `IFluidHandle` ([#22029](https://github.com/microsoft/FluidFramework/pull/22029)) [7827d1040a](https://github.com/microsoft/FluidFramework/commit/7827d1040a9ebc0bd11388dc31f15370ea9f68d3)

    The `isFluidHandle` type guard function is now exported and can be used to detect which objects are `IFluidHandle`s.
    Since `IFluidHandle` often needs special handling (for example when serializing since it's not JSON compatible),
    having a dedicated detection function for it is useful.
    Doing this detection was possible previously using the `tree` package's schema system via `Tree.is(value, new SchemaFactory("").handle)`,
    but can now be done with just `isFluidHandle(value)`.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

### Minor Changes

-   Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
    Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

    External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
    Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
    Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

-   Type Erase IFluidDataStoreRuntime.deltaManager [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

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

    Implementing a custom `IFluidDataStoreRuntime` is not supported: this is now indicated by it being marked with `@sealed`.

## 2.0.0-rc.3.0.0

### Major Changes

-   Packages now use package.json "exports" and require modern module resolution [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Fluid Framework packages have been updated to use the [package.json "exports"
    field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
    TypeScript types and implementation code.

    This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:

    -   `"moduleResolution": "Node16"` with `"module": "Node16"`
    -   `"moduleResolution": "Bundler"` with `"module": "ESNext"`

    We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
    for use with modern versions of Node.js _and_ Bundlers.
    [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
    regarding the module and moduleResolution options.

    **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
    to distinguish stable APIs from those that are in development.**

## 2.0.0-rc.2.0.0

### Minor Changes

-   container-runtime: New feature: ID compression for DataStores & DDSs ([#19859](https://github.com/microsoft/FluidFramework/issues/19859)) [51f0d3db73](https://github.com/microsoft/FluidFramework/commits/51f0d3db737800e1c30ea5e3952d38ff30ffc7da)

    ### Key changes

    1. A new API IContainerRuntimeBase.generateDocumentUniqueId() is exposed. This API will opportunistically generate IDs in short format (non-negative numbers). If it can't achieve that, it will return UUID strings. UUIDs generated will have low entropy in groups and will compress well. It can be leveraged anywhere in container where container unique IDs are required. I.e. any place that uses uuid() and stores data in container is likely candidate to start leveraging this API.
    2. Data store internal IDs (IDs that are auto generated by FF system) will opportunistically be generated in shorter form. Data stores created in detached container will always have short IDs, data stores created in attached container will opportunistically be short (by using newly added IContainerRuntimeBase.generateDocumentUniqueId() capability)
    3. Similar DDS names will be opportunistically short (same considerations for detached DDS vs. attached DDS)

    ### Implementation details

    1. Container level ID Compressor can now be enabled with delay. With such setting, only new IContainerRuntimeBase.generateDocumentUniqueId() is exposed (ID Compressor is not exposed in such case, as leveraging any of its other capabilities requires future container sessions to load ID Compressor on container load, for correctness reasons). Once Container establishes connection and any changes are made in container, newly added API will start generating more compact IDs (in most cases).

    ### Breaking changes

    1. DDS names can no longer start with "\_" symbol - this is reserved for FF needs. I've validated that's not an issue for AzureClient (it only creates root object by name, everything else is referred by handle). Our main internal partners almost never use named DDSs (I can find only 4 instances in Loop).

    ### Backward compatibility considerations

    1. Data store internal IDs could collide with earlier used names data stores. Earlier versions of FF framework (before DataStore aliasing feature was added) allowed customers to supply IDs for data stores. And thus, files created with earlier versions of framework could have data store IDs that will be similar to names FF will use for newly created data stores ("A", ... "Z", "a"..."z", "AA", etc.). While such collision is possible, it's very unlikely (almost impossible) if user-provided names were at least 4-5 characters long.
    2. If application runs to these problems, or wants to reduce risks, consider disabling ID compressor via IContainerRuntimeOptions.enableRuntimeIdCompressor = "off".

    ### Minor changes

    1. IContainerRuntime.createDetachedRootDataStore() is removed. Please use IContainerRuntime.createDetachedDataStore and IDataStore.trySetAlias() instead
    2. IContainerRuntimeOptions.enableRuntimeIdCompressor has been changes from boolean to tri-state.

## 2.0.0-rc.1.0.0

### Minor Changes

-   Updated server dependencies ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The following Fluid server dependencies have been updated to the latest version, 3.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/releases/tag/server_v3.0.0)

    -   @fluidframework/gitresources
    -   @fluidframework/server-kafka-orderer
    -   @fluidframework/server-lambdas
    -   @fluidframework/server-lambdas-driver
    -   @fluidframework/server-local-server
    -   @fluidframework/server-memory-orderer
    -   @fluidframework/protocol-base
    -   @fluidframework/server-routerlicious
    -   @fluidframework/server-routerlicious-base
    -   @fluidframework/server-services
    -   @fluidframework/server-services-client
    -   @fluidframework/server-services-core
    -   @fluidframework/server-services-ordering-kafkanode
    -   @fluidframework/server-services-ordering-rdkafka
    -   @fluidframework/server-services-ordering-zookeeper
    -   @fluidframework/server-services-shared
    -   @fluidframework/server-services-telemetry
    -   @fluidframework/server-services-utils
    -   @fluidframework/server-test-utils
    -   tinylicious

-   Updated @fluidframework/protocol-definitions ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0. [See the full
    changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

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
