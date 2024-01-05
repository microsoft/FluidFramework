# @fluidframework/container-runtime

## 2.0.0-internal.8.0.0

### Major Changes

-   container-runtime: Removed IPendingLocalState and IRuntime.notifyAttaching [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The deprecated `IPendingLocalState` and `IRuntime.notifyAttaching` APIs are removed. There is no replacement as they are
    not longer used.

-   container-runtime: Removed request pattern from ContainerRuntime, IRuntime, and IContainerRuntimeBase [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `request(...)` method and `IFluidRouter` property have been removed from the following places:

    -   `ContainerRuntime`
    -   `IRuntime`
    -   `IContainerRuntimeBase`

    Please use the `IRuntime.getEntryPoint()` method to get the runtime's entry point.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

-   container-runtime: Removed `ContainerRuntime.load(...)` [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The static method `ContainerRuntime.load(...)` has been removed. Please migrate all usage of this method to
    `ContainerRuntime.loadRuntime(...)`.

-   container-runtime-definitions: Removed getRootDataStore [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `getRootDataStore` method has been removed from `IContainerRuntime` and `ContainerRuntime`. Please migrate all usage to the new `getAliasedDataStoreEntryPoint` method. This method returns the data store's entry point which is its `IFluidHandle`.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

## 2.0.0-internal.7.4.0

### Minor Changes

-   container-runtime: (GC) Tombstoned objects will fail to load by default ([#18651](https://github.com/microsoft/FluidFramework/issues/18651)) [2245c0578e](https://github.com/microsoft/FluidFramework/commits/2245c0578e756c944caa5c22311eaafbb73452bb)

    Previously, Tombstoned objects would only trigger informational logs by default, with an option via config to also cause
    errors to be thrown on load. Now, failure to load is the default with an option to disable it if necessary. This
    reflects the purpose of the Tombstone stage which is to mimic the user experience of objects being deleted.

-   container-runtime/runtime-definitions: `IdCompressor` and related types deprecated ([#18749](https://github.com/microsoft/FluidFramework/issues/18749)) [6f070179de](https://github.com/microsoft/FluidFramework/commits/6f070179ded7c2f4398252f75485e85b39725419)

    `IdCompressor` and related types from the @fluidframework/container-runtime and @fluidframework/runtime-definitions
    packages have been deprecated. They can now be found in a new package, @fluidframework/id-compressor.

    The `IdCompressor` class is deprecated even in the new package. Consumers should use the interfaces, `IIdCompressor` and
    `IIdCompressorCore`, in conjunction with the factory function `createIdCompressor` instead.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

### Minor Changes

-   container-runtime: `Summarizer.create(...)` has been deprecated ([#17563](https://github.com/microsoft/FluidFramework/issues/17563)) [4264a3fd18](https://github.com/microsoft/FluidFramework/commits/4264a3fd18ee84e72137982e11438db444cd80f0)

    The public static method `Summarizer.create(...)` has been deprecated and will be removed in a future major release. Creating a summarizer is not a publicly supported API. Please remove all usage of this method.

## 2.0.0-internal.7.0.0

### Major Changes

-   DEPRECATED: container-runtime: requestHandlers are deprecated [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The concept of `requestHandlers` has been deprecated. Please migrate all usage of the following APIs to the new `entryPoint` pattern:

    -   `requestHandler` property in `ContainerRuntime.loadRuntime(...)`
    -   `RuntimeRequestHandler`
    -   `RuntimeRequestHandlerBuilder`
    -   `defaultFluidObjectRequestHandler(...)`
    -   `defaultRouteRequestHandler(...)`
    -   `mountableViewRequestHandler(...)`
    -   `buildRuntimeRequestHandler(...)`
    -   `createFluidObjectResponse(...)`
    -   `handleFromLegacyUri(...)`
    -   `rootDataStoreRequestHandler(...)`

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

-   container-runtime: Removing some deprecated and likely unused ContainerRuntime APIs [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    -   `IGCRuntimeOptions.sweepAllowed`
    -   `ContainerRuntime.reSubmitFn`

-   Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    This included the following changes from the protocol-definitions release:

    -   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
        submitted by clients to the server and the resulting signals sent from the server to clients.
        -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
            been added, which will be the typing for signals sent from the client to the server. Both extend a new
            ISignalMessageBase interface that contains common members.
    -   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

-   DEPRECATED: resolveHandle and IFluidHandleContext deprecated on IContainerRuntime [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The `resolveHandle(...)` and `get IFluidHandleContext()` methods have been deprecated on the following interfaces:

    -   `IContainerRuntime`
    -   `IContainerRuntimeBase`

    Requesting arbitrary URLs has been deprecated on `IContainerRuntime`. Please migrate all usage to the `IContainerRuntime.getEntryPoint()` method if trying to obtain the application-specified root object.

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

-   container-runtime: initializeEntryPoint renamed to provideEntryPoint [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The naming of `initializeEntryPoint` has been changed to `provideEntryPoint`. Please change the property name in relevant calls to `ContainerRuntime.loadRuntime(...)`.

-   test-utils: provideEntryPoint is required [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The optional `provideEntryPoint` method has become required on a number of constructors. A value will need to be provided to the following classes:

    -   `BaseContainerRuntimeFactory`
    -   `RuntimeFactory`
    -   `ContainerRuntime` (constructor and `loadRuntime`)
    -   `FluidDataStoreRuntime`

    See [testContainerRuntimeFactoryWithDefaultDataStore.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/test/test-utils/src/testContainerRuntimeFactoryWithDefaultDataStore.ts) for an example implemtation of `provideEntryPoint` for ContainerRuntime.
    See [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L83) for an example implementation of `provideEntryPoint` for DataStoreRuntime.

    Subsequently, various `entryPoint` and `getEntryPoint()` endpoints have become required. Please see [containerRuntime.ts](https://github.com/microsoft/FluidFramework/tree/main/packages/runtime/container-runtime/src/containerRuntime.ts) for example implementations of these APIs.

    For more details, see [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

### Minor Changes

-   container-runtime: Remove DeltaManagerProxyBase [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    `DeltaManagerProxyBase` was deprecated in [version 2.0.0-internal.6.1.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.6.1.0). It is no longer exported, and no replacement API is intended.

## 2.0.0-internal.6.4.0

### Minor Changes

-   Some stack traces are improved ([#17380](https://github.com/microsoft/FluidFramework/issues/17380)) [34f2808ee9](https://github.com/microsoft/FluidFramework/commits/34f2808ee9764aef21b990f8b48860d9e3ce27a5)

    Some stack traces have been improved and might now include frames for async functions that weren't previously included.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

### Minor Changes

-   Remove use of @fluidframework/common-definitions ([#16638](https://github.com/microsoft/FluidFramework/issues/16638)) [a8c81509c9](https://github.com/microsoft/FluidFramework/commits/a8c81509c9bf09cfb2092ebcf7265205f9eb6dbf)

    The **@fluidframework/common-definitions** package is being deprecated, so the following interfaces and types are now
    imported from the **@fluidframework/core-interfaces** package:

    -   interface IDisposable
    -   interface IErrorEvent
    -   interface IErrorEvent
    -   interface IEvent
    -   interface IEventProvider
    -   interface ILoggingError
    -   interface ITaggedTelemetryPropertyType
    -   interface ITelemetryBaseEvent
    -   interface ITelemetryBaseLogger
    -   interface ITelemetryErrorEvent
    -   interface ITelemetryGenericEvent
    -   interface ITelemetryLogger
    -   interface ITelemetryPerformanceEvent
    -   interface ITelemetryProperties
    -   type ExtendEventProvider
    -   type IEventThisPlaceHolder
    -   type IEventTransformer
    -   type ReplaceIEventThisPlaceHolder
    -   type ReplaceIEventThisPlaceHolder
    -   type TelemetryEventCategory
    -   type TelemetryEventPropertyType

-   Deprecated `refreshLatestAck` in `ISummarizeOptions`, `IOnDemandSummarizeOptions` and `IEnqueueSummarizeOptions` ([#16907](https://github.com/microsoft/FluidFramework/issues/16907)) [5a921c56a6](https://github.com/microsoft/FluidFramework/commits/5a921c56a6ccd29a454e235e9d836717ce401714)

    Passing `refreshLatestAck` as true will result in closing the summarizer. It is not supported anymore and will be removed in a future release. It should not be passed in to `summarizeOnDemand` and `enqueueSummarize` APIs anymore.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Removed IContainerContext.existing [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The recommended means of checking for existing changed to the instantiateRuntime param in 2021, and the IContainerContext.existing member was formally deprecated in 2.0.0-internal.2.0.0. This member is now removed.

-   `getRootDataStore` API is deprecated [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The `getRootDataStore` API that is used to get aliased data store has been deprecated. It will be removed in a future release.
    Use `getAliasedDataStoreEntryPoint` API to get aliased data stores instead. It returns the data store's entry point which is its `IFluidHandle`. To use this API `initializeEntryPoint` must be provided when creating `FluidDataStoreRuntime` [here](https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/datastore/src/dataStoreRuntime.ts#L243). `getAliasedDataStoreEntryPoint` and `initializeEntryPoint` will become required in a future release.

-   Request APIs deprecated from many places [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The `request` API (associated with the `IFluidRouter` interface) has been deprecated on a number of classes and interfaces. The following are impacted:

    -   `IRuntime` and `ContainerRuntime`
    -   `IFluidDataStoreRuntime` and `FluidDataStoreRuntime`
    -   `IFluidDataStoreChannel`
    -   `MockFluidDataStoreRuntime`
    -   `TestFluidObject`

    Please migrate usage to the corresponding `entryPoint` or `getEntryPoint()` of the object. The value for these "entryPoint" related APIs is determined from factories (for `IRuntime` and `IFluidDataStoreRuntime`) via the `initializeEntryPoint` method. If no method is passed to the factory, the corresponding `entryPoint` and `getEntryPoint()` will be undefined.

    For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/blob/next/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L84).

    More information of the migration off the request pattern, and current status of its removal, is documented in [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md).

-   `initializeEntryPoint` will become required [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The optional `initializeEntryPoint` method has been added to a number of constructors. **This method argument will become required in an upcoming release** and a value will need to be provided to the following classes:

    -   `BaseContainerRuntimeFactory`
    -   `ContainerRuntimeFactoryWithDefaultDataStore`
    -   `RuntimeFactory`
    -   `ContainerRuntime` (constructor and `loadRuntime`)
    -   `FluidDataStoreRuntime`

    For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L84).

    This work will replace the request pattern. See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more info on this effort.

-   New required method `getAliasedDataStoreEntryPoint` in ContainerRuntime [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    `getAliasedDataStoreEntryPoint` API has been added to ContainerRuntime. This can be used to get the entry point to an aliased data stores. To use this API `initializeEntryPoint` must be provided when creating `FluidDataStoreRuntime` [here](https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/datastore/src/dataStoreRuntime.ts#L243). `getAliasedDataStoreEntryPoint` and `initializeEntryPoint` will become required in a future release.

-   `IRootSummaryTreeWithStats` removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    `IRootSummaryTreeWithStats` was the return type of `summarize` method on `ContainerRuntime`. It was an internal interface used only in `ContainerRuntime` class to to access `gcStats` from a call site. `gcStats` is not needed in the call site anymore so this interface is removed.

-   getPendingLocalState and closeAndGetPendingLocalState are now async [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    getPendingLocalState and closeAndGetPendingLocalState are now async to allow uploading blobs to attach to a DDS (in closing scenario). There is a new parameter in those methods at the container/runtime layer "notifyImminentClosure" which is true only when closing and ensures uploading blobs fast resolve and get attached. Once we apply stashed ops to new container, blob will try to reupload and we will know where to place its references.

-   Calling `ContainerRuntime.closeFn(...)` will no longer call `ContainerContext.disposeFn(...)` as well [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    This means the `ContainerRuntime` will no longer be disposed by calling this method.

    If you want to dispose the `ContainerRuntime`, use the `ContainerRuntime.disposeFn` method.

    For more information about close vs. dispose expectations, see the [Closure](https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-loader/README.md#closure) section of Loader README.md.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

-   IDeltaManager members disposed and dispose() removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IDeltaManager members disposed and dispose() were deprecated in 2.0.0-internal.5.3.0 and have now been removed.

## 2.0.0-internal.5.4.0

### Minor Changes

-   ContainerRuntime.reSubmitFn is deprecated: ([#16276](https://github.com/microsoft/FluidFramework/issues/16276)) [46707372e8](https://github.com/microsoft/FluidFramework/commits/46707372e82a492f6e42b683d37d49c25e6be15b)

    ContainerRuntime.reSubmitFn is deprecatedsince this functionality needs not be exposed, and we are refactoring the
    signatures of related code internally.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

### Minor Changes

-   IContainerContext members deprecated ([#16180](https://github.com/microsoft/FluidFramework/issues/16180)) [bf6a26cfe6](https://github.com/microsoft/FluidFramework/commits/bf6a26cfe6ac58386f2c9af260603a15b03ba84f)

    IContainerContext members disposed, dispose(), serviceConfiguration, and id have been deprecated and will be removed in an upcoming release.

    disposed - The disposed state on the IContainerContext is not meaningful to the runtime.

    dispose() - The runtime is not permitted to dispose the IContainerContext, this results in an inconsistent system state.

    serviceConfiguration - This property is redundant, and is unused by the runtime. The same information can be found via `deltaManager.serviceConfiguration` on this object if it is necessary.

    id - The docId is already logged by the IContainerContext.taggedLogger for telemetry purposes, so this is generally unnecessary for telemetry. If the id is needed for other purposes it should be passed to the consumer explicitly.

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

-   The following functions and classes were deprecated in previous releases and have been removed: [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    -   `PureDataObject.getFluidObjectFromDirectory`
    -   `IProvideContainerRuntime` and its `IContainerRuntime` member.
    -   `ContainerRuntime`'s `IProvideContainerRuntime` has also been removed.

-   The 'flush' concepts in the PendingStateManager in @fluidframework/container-runtime have been removed. This is [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)
    primarily an internal change that should not affect package consumers.
-   In @fluidframework/container-runtime, the `on("op")` and `off("op")` methods on `ISummarizerRuntime` are now required. These listener methods are needed to accurately run summary heuristics. [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)
-   Calling `IContainer.close(...)` will no longer dispose the container runtime, document service, or document storage service. [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    If the container is not expected to be used after the `close(...)` call, replace it instead with a
    `IContainer.dispose(...)` call (this should be the most common case). Using `IContainer.dispose(...)` will no longer
    switch the container to "readonly" mode and relevant code should instead listen to the Container's "disposed" event.

    If you intend to pass your own critical error to the container, use `IContainer.close(...)`. Once you are done using the
    container, call `IContainer.dispose(...)`.

    See the [Closure](packages/loader/container-loader/README.md#Closure) section of Loader README.md for more details.

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

-   Ability to enable grouped batching ([#14512](https://github.com/microsoft/FluidFramework/pull-requests/14512)) [8e4dc47a38](https://github.com/microsoft/FluidFramework/commits/8e4dc47a3871bcaf1f7c1339c362d9c9d08551fc)

    The `IContainerRuntimeOptions.enableGroupedBatching` option has been added to the container runtime layer and is off by default. This option will group all batch messages
    under a new "grouped" message to be sent to the service. Upon receiving this new "grouped" message, the batch messages will be extracted and given
    the sequence number of the parent "grouped" message.

    Upon enabling this option, if any issues arise, use the `Fluid.ContainerRuntime.DisableGroupedBatching` feature flag to disable at runtime. This option should **ONLY** be enabled after observing that 99.9% of your application sessions contains these changes (version "2.0.0-internal.4.1.0" or later). This option is experimental and should not be enabled yet in production. Containers created with this option may not open in future versions of the framework.

    This option will change a couple of expectations around message structure and runtime layer expectations. Only enable this option after testing
    and verifying that the following expectation changes won't have any effects:

    -   batch messages observed at the runtime layer will not match messages seen at the loader layer
    -   messages within the same batch will have the same sequence number
    -   client sequence numbers on batch messages can only be used to order messages with the same sequenceNumber
    -   requires all ops to be processed by runtime layer (version "2.0.0-internal.1.2.0" or later
        https://github.com/microsoft/FluidFramework/pull/11832)

-   Op compression is enabled by default ([#14856](https://github.com/microsoft/FluidFramework/pull-requests/14856)) [439c21f31f](https://github.com/microsoft/FluidFramework/commits/439c21f31f4a3ea6515f01d2b2be7f35c04910ce)

    If the size of a batch is larger than 614kb, the ops will be compressed. After upgrading to this version, if batches exceed the size threshold, the runtime will produce a new type of op with the compression properties. To open a document which contains this type of op, the client's runtime version needs to be at least `client_v2.0.0-internal.2.3.0`. Older clients will close with assert `0x3ce` ("Runtime message of unknown type") and will not be able to open the documents until they upgrade. To minimize the risk, it is recommended to audit existing session and ensure that at least 99.9% of them are using a runtime version equal or greater than `client_v2.0.0-internal.2.3.0`, before upgrading to `2.0.0-internal.4.1.0`.

    More information about op compression can be found
    [here](./packages/runtime/container-runtime/src/opLifecycle/README.md).

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
