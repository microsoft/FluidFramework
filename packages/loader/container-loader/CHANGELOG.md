# @fluidframework/container-loader

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

### Minor Changes

-   New APIs to create and load containers without using the Loader object ([#22902](https://github.com/microsoft/FluidFramework/pull/22902)) [51a17289c6](https://github.com/microsoft/FluidFramework/commit/51a17289c683ff6666e496878cb6660d21759b16)

    #### Overview

    Provide standalone APIs to create and load containers instead of using the Loader object to do so. Earlier hosts were
    supposed to create the Loader object first and then call methods on it to create and load containers. Now they can just
    utilize these APIs directly and get rid of the Loader object.

    ##### Use `createDetachedContainer` to create a detached container

    ```typescript
    export async function createDetachedContainer(
    	createDetachedContainerProps: ICreateDetachedContainerProps,
    ): Promise<IContainer> {}
    ```

    `ICreateDetachedContainerProps` are the properties that need to be supplied to the above API and include props like
    URL Resolver, IDocumentServiceFactory, etc., which were previously used to create the `Loader` object.

    ##### Use `loadExistingContainer` to load an existing container

    ```typescript
    export async function loadExistingContainer(
    	loadExistingContainerProps: ILoadExistingContainerProps,
    ): Promise<IContainer> {}
    ```

    `ILoadExistingContainerProps` are the properties that need to be supplied to the above API and include props like
    URL Resolver, IDocumentServiceFactory, etc., which were earlier used to create the `Loader` object.

    ##### Use `rehydrateDetachedContainer` to create a detached container from a serializedState of another container

    ```typescript
    export async function rehydrateDetachedContainer(
    	rehydrateDetachedContainerProps: IRehydrateDetachedContainerProps,
    ): Promise<IContainer> {}
    ```

    `IRehydrateDetachedContainerProps` are the properties that need to be supplied to the above API and include props like
    URL Resolver, IDocumentServiceFactory, etc., which were earlier used to create the `Loader` object.

    ##### Note on `ICreateAndLoadContainerProps`.

    The props which were used to create the `Loader` object are now moved to the `ICreateAndLoadContainerProps` interface.
    `ICreateDetachedContainerProps`, `ILoadExistingContainerProps` and `IRehydrateDetachedContainerProps` which extends
    `ICreateAndLoadContainerProps` also contains some additional props which will be used to create and load containers like
    `IFluidCodeDetails`, `IRequest`, etc. Previously these were directly passed when calling APIs like
    `Loader.createDetachedContainer`, `Loader.resolve` and `Loader.rehydrateDetachedContainerFromSnapshot` on the `Loader`
    object. Also, `ILoaderProps.ILoaderOptions` are not replaced with `ICreateAndLoadContainerProps.IContainerPolicies`
    since there will be no concept of `Loader`.

## 2.11.0

Dependency updates only.

## 2.10.0

### Minor Changes

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

-   container-loader: summarizeProtocolTree and its corresponding duplicate ILoaderOptions definition is deprecated ([#21999](https://github.com/microsoft/FluidFramework/pull/21999)) [11ccda1597](https://github.com/microsoft/FluidFramework/commit/11ccda15970a10de00facfebfc060bece4a459ba)

    The `summarizeProtocolTree` property in ILoaderOptions was added to test single-commit summaries during the initial
    implementation phase. The flag is no longer required and should no longer be used, and is now marked deprecated. If a
    driver needs to enable or disable single-commit summaries, it can do so via `IDocumentServicePolicies`.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

-   container-loader: IDetachedBlobStorage is deprecated and replaced with a default in memory store for detached blobs ([#21144](https://github.com/microsoft/FluidFramework/pull/21144)) [2eebaa1775](https://github.com/microsoft/FluidFramework/commit/2eebaa1775dba0a677a005ba36f6f946c6324c21)

    IDetachedBlobStorage will be removed in a future release without a replacement.

    When applications load a container without specifying ILoaderServices.detachedBlobStorage, an implementation which stores the blobs in memory will be injected by Fluid.

    IDetachedBlobStorage as well as application-defined implementations of it are deprecated and support will be removed for them in a future update.
    Applications are recommended to stop providing this property on ILoaderServices.

-   Update to ES 2022 ([#21292](https://github.com/microsoft/FluidFramework/pull/21292)) [68921502f7](https://github.com/microsoft/FluidFramework/commit/68921502f79b1833c4cd6d0fe339bfb126a712c7)

    Update tsconfig to target ES 2022.

## 2.0.0-rc.4.0.0

### Major Changes

-   Audience & connection sequencing improvements [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Here are breaking changes in Audience behavior:

    1. IAudience no longer implements EventEmmiter. If you used addListener() or removeListener(), please replace with on() & off() respectively.
    2. IAudience interface implements getSelf() method and "selfChanged" event.
    3. IContainerContext.audience is no longer optional
    4. "connected" events are now raised (various API surfaces - IContainer, IContainerRuntime, IFluidDataStoreRuntime, etc.) a bit later in reconnection sequence for "read" connections - only after client receives its own "join" signal and caught up on ops, which makes it symmetrical with "write" connections.

    -   If this change in behavior breaks some scenario, please let us know immediately, but you can revert that behavior using the following feature gates:
        -   "Fluid.Container.DisableCatchUpBeforeDeclaringConnected"
        -   "Fluid.Container.DisableJoinSignalWait"

## 2.0.0-rc.3.0.0

### Major Changes

-   container-definitions: IContainerContext.getSpecifiedCodeDetails() removed [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    IContainerContext.getSpecifiedCodeDetails() was deprecated in 0.42 and has now been removed.

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

### Minor Changes

-   driver-definitions: update submitSignal content type to string [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Change IDocumentDeltaConnection.submitSignal's content argument type to string which represents actual/known use.

## 2.0.0-rc.2.0.0

### Minor Changes

-   container-loader: Behavior change: IContainer.attach will be made retriable in the next release ([#19246](https://github.com/microsoft/FluidFramework/issues/19246)) [3d5dfb28d4](https://github.com/microsoft/FluidFramework/commits/3d5dfb28d47b55943c6a92ec50530e6fa86b0568)

    The `attach` function on IContainer has been modified such that the container stay open on non-fatal errors. On failure of attach the developer should inspect IContainer.closed to see if the container has been closed. If not closed, the developer can retry calling attach.

    The functionality is currently behind a configuration `Fluid.Container.RetryOnAttachFailure` which can be set to `true` to enable the new functionality.

    In the next release we will default to the new behavior, and it will be possible to disable this behavior by setting `Fluid.Container.RetryOnAttachFailure` to `false`

-   driver-definitions: Deprecate `ISnapshotContents` ([#19314](https://github.com/microsoft/FluidFramework/issues/19314)) [fc731b69de](https://github.com/microsoft/FluidFramework/commits/fc731b69deed4a2987e9b97d8918492d689bafbc)

    `ISnapshotContents` is deprecated. It has been replaced with `ISnapshot`.

-   driver-definitions: repositoryUrl removed from IDocumentStorageService ([#19522](https://github.com/microsoft/FluidFramework/issues/19522)) [90eb3c9d33](https://github.com/microsoft/FluidFramework/commits/90eb3c9d33d80e24caa1393a50f414c5602f6aa3)

    The `repositoryUrl` member of `IDocumentStorageService` was unused and always equal to the empty string. It has been removed.

-   container-loader: IParsedUrl does not accept null version ([#19854](https://github.com/microsoft/FluidFramework/issues/19854)) [ba6012a927](https://github.com/microsoft/FluidFramework/commits/ba6012a92761022613b31b4638d82054cffb9596)

    `IParsedUrl` previously claimed to accept `null` version to indicate that we should not load from a snapshot, but this was internally converted into `undefined` (thereby loading from latest snapshot). The typing has been updated to reflect this reality.

-   Deprecated error-related enums have been removed ([#19067](https://github.com/microsoft/FluidFramework/issues/19067)) [59793302e5](https://github.com/microsoft/FluidFramework/commits/59793302e56784cfb6ace0e6469345f3565b3312)

    Error-related enums `ContainerErrorType`, `DriverErrorType`, `OdspErrorType` and `RouterliciousErrorType` were previously
    deprecated and are now removed. There are replacement object-based enumerations of `ContainerErrorTypes`,
    `DriverErrorTypes`, `OdspErrorTypes` and `RouterliciousErrorTypes`. Refer to the release notes of [Fluid Framework version
    2.0.0-internal.7.0.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.7.0.0) for details
    on the replacements.

-   container-loader: Internal format of the string returned by container.serialize has changed. ([#18829](https://github.com/microsoft/FluidFramework/issues/18829)) [a10cfd54f5](https://github.com/microsoft/FluidFramework/commits/a10cfd54f5680ccc98cb0aef6832637dfdb005a5)

    `serialize` is being changed to align format with similar APIs. There are no changes in external behaviour.

-   container-definitions: ILoaderOptions no longer accepts arbitrary key/value pairs ([#19306](https://github.com/microsoft/FluidFramework/issues/19306)) [741926e225](https://github.com/microsoft/FluidFramework/commits/741926e2253a161504ecc6a6451d8f15d7ac4ed6)

    ILoaderOptions has been narrowed to the specific set of supported loader options, and may no longer be used to pass arbitrary key/value pairs through to the runtime.

-   container-definitions: Added containerMetadata prop on IContainer interface ([#19142](https://github.com/microsoft/FluidFramework/issues/19142)) [d0d77f3516](https://github.com/microsoft/FluidFramework/commits/d0d77f3516d67f3c9faedb47b20dbd4e309c3bc2)

    Added `containerMetadata` prop on IContainer interface.

-   runtime-definitions: Moved ISignalEnvelope interface to core-interfaces ([#19142](https://github.com/microsoft/FluidFramework/issues/19142)) [d0d77f3516](https://github.com/microsoft/FluidFramework/commits/d0d77f3516d67f3c9faedb47b20dbd4e309c3bc2)

    The `ISignalEnvelope` interface has been moved to the @fluidframework/core-interfaces package.

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

-   container-loader: Removed request(...) and IFluidRouter from ILoader and Loader [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `request(...)` method and `IFluidRouter` property have been removed from `ILoader` and `Loader`. Instead, after
    calling `ILoader.resolve(...)`, call the `getEntryPoint()` method on the returned `IContainer`.

    See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

-   container-definitions: Fix ISnapshotTreeWithBlobContents and mark internal [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    `ISnapshotTreeWithBlobContents` is an internal type that should not be used externally. Additionally, the type didn't
    match the usage, specifically in runtime-utils where an `any` cast was used to work around undefined blobContents. The
    type has been updated to reflect that blobContents can be undefined.

-   container-loader: Removed requestResolvedObjectFromContainer [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The helper function `requestResolvedObjectFromContainer` has been removed. Please remove all calls to it and instead use
    the new `entryPoint` pattern. See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

### Minor Changes

-   Move `location-redirection-utils` APIs to `container-loader` ([#17554](https://github.com/microsoft/FluidFramework/issues/17554)) [17acf10a71](https://github.com/microsoft/FluidFramework/commits/17acf10a71e51e2490d1df57c89430c1be04c345)

    Moves the 2 package exports of `location-redirection-utils` to the `container-loader` package.

    Exports from `location-redirection-utils` are now deprecated, and the package itself will be removed in an upcoming release.

## 2.0.0-internal.7.0.0

### Major Changes

-   odsp-driver: Load container in readonly mode when driver throws DriverErrorType.outOfStorage [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Handle DriverErrorType.outOfStorage error from driver and load the container in readonly mode. Currently there is no
    handling and when the join session throws this error, the container will get closed. With this we use NoDeltaStream
    object as connection and load the container in read mode, so that it loads properly. We also notify the that the
    container is "readonly" through the event on delta manager so that apps can listen to this and show any UX etc. The app
    can listen to the event like this:

    ```ts
    container.deltaManager.on(
    	"readonly",
    	(readonly?: boolean, readonlyConnectionReason?: { text: string; error?: IErrorBase }) => {
    		// error?.errorType will be equal to DriverErrorType.outOfStorage in this case
    		// App logic
    	},
    );
    ```

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

-   container-definitions: IContainer's and IDataStore's IFluidRouter capabilities are deprecated [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    `IFluidRouter` and `request({ url: "/" })` on `IContainer` and `IDataStore` are deprecated and will be removed in a future major release. Please migrate all usage to the appropriate `getEntryPoint()` or `entryPoint` APIs.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

-   routerlicious-driver: remove dead blob aggregation concepts and code [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Dead concepts blob aggregation like `aggregateBlobsSmallerThanBytes` and `minBlobSize` have been removed.

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

-   container-loader: Containers will connect in read-mode by default [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    When a container is loaded, it will connect in read-mode unless it is loaded with a pending state containing stashed ops.

-   container-loader: Container caching in the Loader is removed [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Container caching in the Loader has been removed. Do not to rely on caching and inform the FluidFramework team ASAP if you cannot do so.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

### Minor Changes

-   Temporarily restore id property on IContainerContext ([#16846](https://github.com/microsoft/FluidFramework/issues/16846)) [9825a692dd](https://github.com/microsoft/FluidFramework/commits/9825a692dd27eded214e3978a7fd6028b05e6fab)

    The `id` property on `IContainerContext` has been temporarily restored to ease the transition to `2.0.0-internal.6.x`.
    It will be removed again in `2.0.0-internal.7.0.0`.

    The original deprecation announcement can be found [here](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.5.2.0).

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

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Removed IContainerContext.existing [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The recommended means of checking for existing changed to the instantiateRuntime param in 2021, and the IContainerContext.existing member was formally deprecated in 2.0.0-internal.2.0.0. This member is now removed.

-   Remove closeAndGetPendingLocalState from IContainer [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    This change removes the deprecated and experimental method closeAndGetPendingLocalState from IContainer. It continues to
    exist on IContainerExperimental.

    IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
    Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate
    on and finalize our experimental features.

    Experimental features should not be used in production environments.

-   Loader container caching off by default [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Loader container caching will now be off by default and the ability to control it is deprecated. Loader caching is deprecated and will be removed in a future release, as well as all caching functionality of containers. Please try not to rely on caching and inform us if you cannot do so.

    If you run into trouble with this behavior, please report it ASAP to the FluidFramework team and use the following options (available in this release only) to unblock you:

    -   set `ILoaderProps.options.cache` to `true` when constructing a `Loader` object (see the `ILoaderOptions` interface)
    -   set `[LoaderHeader.cache]` header to `true` when requesting a container

-   getPendingLocalState and closeAndGetPendingLocalState are now async [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    getPendingLocalState and closeAndGetPendingLocalState are now async to allow uploading blobs to attach to a DDS (in closing scenario). There is a new parameter in those methods at the container/runtime layer "notifyImminentClosure" which is true only when closing and ensures uploading blobs fast resolve and get attached. Once we apply stashed ops to new container, blob will try to reupload and we will know where to place its references.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

-   `Loader.resolve()` throws if `LoaderHeader.sequenceNumber` and `IContainerLoadMode.opsBeforeReturn` do not match [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Calling `Loader.resolve()` will now throw an error if `LoaderHeader.sequenceNumber` is defined but `IContainerLoadMode.opsBeforeReturn` is not set to "sequenceNumber". Vice versa, `Loader.resolve()` will also throw an error if `IContainerLoadMode.opsBeforeReturn` is set to "sequenceNumber" but `LoaderHeader.sequenceNumber` is not defined.

-   IDeltaManager members disposed and dispose() removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IDeltaManager members disposed and dispose() were deprecated in 2.0.0-internal.5.3.0 and have now been removed.

-   Request APIs deprecated on ILoader [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The `request` API (associated with the `IFluidRouter` interface) has been deprecated on `ILoader` and `Loader`.
    Please migrate all usage to using the `IContainer.request(...)` method if using a dynamic request URL, or to the `IContainer.getEntryPoint()` method if trying to obtain the application-specified root object.

    **Note:** The `IContainer.request(...)` method will be deprecated in an upcoming release, so do not rely on this method for a long-term solution (the APIs around `entryPoint` and `getEntryPoint()` will become required and available for usage in its place).

    After calling `ILoader.resolve(...)`, call the `request(...)` method on the returned `IContainer` with a corresponding request URL. For converting a request URL from `Loader` to `Container`, use the `IUrlResolver` passed into the `Loader`'s constructor.
    The following is an example of what this change may look like:

    ```
    // OLD
    const request: IRequest;
    const urlResolver = new YourUrlResolver();
    const loader = new Loader({ urlResolver, ... });

    await loader.resolve(request);
    const response = loader.request(request);
    ```

    ```
    // NEW
    const request: IRequest;
    const urlResolver = new YourUrlResolver();
    const loader = new Loader({ urlResolver, ... });

    const container = await loader.resolve(request);
    const resolvedUrl: IRequest = urlResolver.resolve(request);

    // Parse the `resolvedUrl.url` property as necessary before passing to `container.request(...)`
    // For an example, see the `Loader.resolveCore(...)` method
    const parsedResolvedUrl = // implement parse logic here
    const response = container.request(parsedResolvedUrl);
    ```

    Status on removal of the request pattern is tracked in [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

### Minor Changes

-   Move closeAndGetPendingLocalState to IContainerExperimental ([#16302](https://github.com/microsoft/FluidFramework/issues/16302)) [93151af787](https://github.com/microsoft/FluidFramework/commits/93151af787b76e547cf3460df47f81832131db8c)

    This change deprecates the experimental method closeAndGetPendingLocalState on IContainer and moves it to IContainerExperimental.
    IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
    Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate on and finalize our experimental features.
    Experimental features should not be used in production environments.

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

-   IContainer.dispose is now required [96484ac6c2](https://github.com/microsoft/FluidFramework/commits/96484ac6c24fed60f79d717616cb9072ab476488)

    `IContainer.dispose` is now a required method. This method should dispose any resources and switch the container to a
    permanently disconnected state.

    See the
    [Closure](https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-loader/README.md#closure)
    section of Loader README.md for more details.

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

-   Container-loader deprecations ([#14891](https://github.com/microsoft/FluidFramework/pull-requests/14891)) [961e96f3c9](https://github.com/microsoft/FluidFramework/commits/961e96f3c92d1dcf9575e56c703fe1779af5442d)

    The following types in the @fluidframework/container-loader package are not used by, or necessary to use our public api, so will be removed from export in the next major release:

    -   IContainerLoadOptions
    -   IContainerConfig
    -   IPendingContainerState
    -   ISerializableBlobContents
