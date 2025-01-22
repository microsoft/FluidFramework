# @fluidframework/container-runtime

## 2.20.0

### Minor Changes

-   The ContainerRuntime class has been removed ([#23341](https://github.com/microsoft/FluidFramework/pull/23341)) [61ba06aa98](https://github.com/microsoft/FluidFramework/commit/61ba06aa9881c30ffeeedcaaede9c5a1a0c81abd)

    The `ContainerRuntime` class was [deprecated in version 2.12.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-the-containerruntime-class-is-now-deprecated-23331) and has been removed.
    Use `IContainerRuntime` to replace type usages and use the free function `loadContainerRuntime` to replace usages of the static method `ContainerRuntime.loadRuntime`.

    See the [deprecation
    announcement](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-the-containerruntime-class-is-now-deprecated-23331)
    for more details about how to update existing code.

-   The IContainerRuntimeOptions.flushMode property has been removed ([#23337](https://github.com/microsoft/FluidFramework/pull/23337)) [fe8279c774](https://github.com/microsoft/FluidFramework/commit/fe8279c774fcc3c4805b49ce4f64d0e03a64c39b)

    The `IContainerRuntimeOptions.flushMode` property was [deprecated in version 2.12.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-icontainerruntimeoptionsflushmode-is-now-deprecated-23288) and has been removed.

    Only the default value, `FlushMode.TurnBased`, is supported when calling `ContainerRuntime.loadRuntime` directly,
    so there's no need for consumers to pass this option in.

-   The createDataStoreWithProps APIs on ContainerRuntime and IContainerRuntimeBase have been removed ([#22996](https://github.com/microsoft/FluidFramework/pull/22996)) [bd243fb292](https://github.com/microsoft/FluidFramework/commit/bd243fb2927915d87c42486e21ee0c990962a9a7)

    `ContainerRuntime.createDataStoreWithProps` and `IContainerRuntimeBase.createDataStoreWithProps`
    were [deprecated in version 0.25.0](https://github.com/microsoft/FluidFramework/blob/main/BREAKING.md#icontainerruntimebase_createdatastorewithprops-is-removed) and have been removed.

    Replace uses of these APIs with `PureDataObjectFactory.createInstanceWithDataStore` and pass in props via the `initialState`
    parameter.

    These changes were originally announced in version 0.25.0. See the following issues for more details:

    -   [#1537](https://github.com/microsoft/FluidFramework/issues/1537)
    -   [#2931](https://github.com/microsoft/FluidFramework/pull/2931)

-   Enabling Op Compression without Op Grouping is no longer supported ([#23608](https://github.com/microsoft/FluidFramework/pull/23608)) [92b695aa4b](https://github.com/microsoft/FluidFramework/commit/92b695aa4b36eee41a4d235a71c6408d2c70b54b)

    `IContainerRuntimeOptions.enableGroupedBatching` was deprecated in 2.12 (see [release notes](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.12.0#user-content-icontainerruntimeoptionsenablegroupedbatching-is-now-deprecated-23260)).
    While this option is not yet removed (and still defaults to `true`), disabling it (by setting to `false`) is not supported
    if compression is enabled (by passing a finite value for `IContainerRuntimeOptions.compressionOptions.minimumBatchSizeInBytes`).

-   Summarizer-related types have been moved to container-runtime-definitions ([#23483](https://github.com/microsoft/FluidFramework/pull/23483)) [6666d496e6](https://github.com/microsoft/FluidFramework/commit/6666d496e63031026cdedee98c24bb59fa79edcf)

    `SummarizerStopReason`, `ISummarizeEventProps`, and `ISummarizerEvents` have all been moved from the
    `"@fluidframework/container-runtime"` package to `@fluidframework/container-runtime-definitions`.

    Users should now import them from `@fluidframework/container-runtime-definitions`.

## 2.13.0

Dependency updates only.

## 2.12.0

### Minor Changes

-   SummarizerStopReason, ISummarizeEventProps, and ISummarizerEvents are now deprecated ([#23217](https://github.com/microsoft/FluidFramework/pull/23217)) [cd88ee2320](https://github.com/microsoft/FluidFramework/commit/cd88ee2320c40ed9e0d43ec8ed73cb878f1c18a9)

    `SummarizerStopReason`, `ISummarizeEventProps`, and `ISummarizerEvents` have all been deprecated from the `"@fluidframework/container-runtime"` package. Please migrate all uses of these APIs to their counterparts in the `"@fluidframework/container-runtime-definitions"` package.

-   IContainerRuntimeOptions.flushMode is now deprecated ([#23288](https://github.com/microsoft/FluidFramework/pull/23288)) [af1cd7b370](https://github.com/microsoft/FluidFramework/commit/af1cd7b3707cce1306ae071aba1482734b039635)

    The `IContainerRuntimeOptions.flushMode` property is deprecated and will be removed in version 2.20.0.

    Only the default value `FlushMode.TurnBased` is supported when calling `ContainerRuntime.loadRuntime` directly, so there's no need for consumers to pass this option in.

-   The ContainerRuntime class is now deprecated ([#23331](https://github.com/microsoft/FluidFramework/pull/23331)) [dc48446d7c](https://github.com/microsoft/FluidFramework/commit/dc48446d7c4914aca2a76095205975824aac1ba5)

    The class `ContainerRuntime` is deprecated and will no longer be exported starting in version 2.20.0.

    There are two possible migration paths to stop using `ContainerRuntime`:

    -   When using it as a type, replace it with an interface like `IContainerRuntime`
    -   When using the static function `ContainerRuntime.loadRuntime` replace it with the free function `loadContainerRuntime`.

    `BaseContainerRuntimeFactory` has some changes as well, since it exposed `ContainerRuntime` in several function signatures:

    -   `instantiateFirstTime` - Takes the wider type `IContainerRuntime` instead of `ContainerRuntime`
    -   `instantiateFromExisting` - Takes the wider type `IContainerRuntime` instead of `ContainerRuntime`
    -   `preInitialize` - deprecated as well, since it returns `ContainerRuntime`

    These functions should never be called directly anyway - use `BaseContainerRuntimeFactory.instantiateRuntime` instead.

-   IContainerRuntimeOptions.enableGroupedBatching is now deprecated ([#23260](https://github.com/microsoft/FluidFramework/pull/23260)) [49d8e75e5c](https://github.com/microsoft/FluidFramework/commit/49d8e75e5cad12205aed15850db72c1ad21513c3)

    The `IContainerRuntimeOptions.enableGroupedBatching` property is deprecated and will be removed in version 2.20.0. This will mean that the grouped batching feature can no longer be disabled. In versions 2.20.0 and beyond, grouped batching is required for the proper functioning of the Fluid Framework.

    The sole case where grouped batching will be disabled is for compatibility with older v1 clients, and this will be implemented without any need for the configurable `IContainerRuntimeOptions.enableGroupedBatching` option.

## 2.11.0

### Minor Changes

-   Synchronous Child Datastore Creation ([#23143](https://github.com/microsoft/FluidFramework/pull/23143)) [3426b434df](https://github.com/microsoft/FluidFramework/commit/3426b434dfa06de3ee1a60a5f0d605cd312f2c58)

    #### Overview

    This feature introduces a new pattern for creating datastores synchronously within the Fluid Framework. It allows for the synchronous creation of a child datastore from an existing datastore, provided that the child datastore is available synchronously via the existing datastore's registry and that the child's factory supports synchronous creation. This method also ensures strong typing for the consumer.

    In this context, "child" refers specifically to the organization of factories and registries, not to any hierarchical or hosting relationship between datastores. The parent datastore does not control the runtime behaviors of the child datastore beyond its creation.

    The synchronous creation of child datastores enhances the flexibility of datastore management within the Fluid Framework. It ensures type safety and provides a different way to manage datastores within a container. However, it is important to consider the overhead associated with datastores, as they are stored, summarized, garbage collected, loaded, and referenced independently. This overhead should be justified by the scenario's requirements.

    Datastores offer increased capabilities, such as the ability to reference them via handles, allowing multiple references to exist and enabling those references to be moved, swapped, or changed. Additionally, datastores are garbage collected after becoming unreferenced, which can simplify final cleanup across clients. This is in contrast to subdirectories in a shared directory, which do not have native capabilities for referencing or garbage collection but are very low overhead to create.

    Synchronous creation relies on both the factory and the datastore to support it. This means that asynchronous operations, such as resolving handles, some browser API calls, consensus-based operations, or other asynchronous tasks, cannot be performed during the creation flow. Therefore, synchronous child datastore creation is best limited to scenarios where the existing asynchronous process cannot be used, such as when a new datastore must be created in direct response to synchronous user input.

    #### Key Benefits

    -   **Synchronous Creation**: Allows for the immediate creation of child datastores without waiting for asynchronous operations.
    -   **Strong Typing**: Ensures type safety and better developer experience by leveraging TypeScript's type system.

    #### Use Cases

    ##### Example 1: Creating a Child Datastore

    In this example, we demonstrate how to support creating a child datastore synchronously from a parent datastore.

    ```typescript
    /**
     * This is the parent DataObject, which is also a datastore. It has a
     * synchronous method to create child datastores, which could be called
     * in response to synchronous user input, like a key press.
     */
    class ParentDataObject extends DataObject {
    	createChild(name: string): ChildDataStore {
    		assert(
    			this.context.createChildDataStore !== undefined,
    			"this.context.createChildDataStore",
    		);

    		const { entrypoint } = this.context.createChildDataStore(
    			ChildDataStoreFactory.instance,
    		);
    		const dir = this.root.createSubDirectory("children");
    		dir.set(name, entrypoint.handle);
    		entrypoint.setProperty("childValue", name);

    		return entrypoint;
    	}

    	getChild(name: string): IFluidHandle<ChildDataStore> | undefined {
    		const dir = this.root.getSubDirectory("children");
    		return dir?.get<IFluidHandle<ChildDataStore>>(name);
    	}
    }
    ```

    For a complete example see the following test:
    https://github.com/microsoft/FluidFramework/blob/main/packages/test/local-server-tests/src/test/synchronousDataStoreCreation.spec.ts

## 2.10.0

### Minor Changes

-   "Remove `IFluidParentContext.ensureNoDataModelChanges` and its implementations ([#22842](https://github.com/microsoft/FluidFramework/pull/22842)) [3aff19a462](https://github.com/microsoft/FluidFramework/commit/3aff19a4622a242e906286c14dfcfa6523175132)

    -   `IFluidParentContext.ensureNoDataModelChanges` has been removed. [prior deprecation commit](https://github.com/microsoft/FluidFramework/commit/c9d156264bdfa211a3075bdf29cde442ecea234c)
    -   `MockFluidDataStoreContext.ensureNoDataModelChanges` has also been removed.

-   The inbound and outbound properties have been removed from IDeltaManager ([#22282](https://github.com/microsoft/FluidFramework/pull/22282)) [45a57693f2](https://github.com/microsoft/FluidFramework/commit/45a57693f291e0dc5e91af7f29a9b9c8f82dfad5)

    The inbound and outbound properties were [deprecated in version 2.0.0-rc.2.0.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.0.0-rc.2.0.0.md#container-definitions-deprecate-ideltamanagerinbound-and-ideltamanageroutbound) and have been removed from `IDeltaManager`.

    `IDeltaManager.inbound` contained functionality that could break core runtime features such as summarization and processing batches if used improperly. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

    Similarly, `IDeltaManager.outbound` contained functionality that could break core runtime features such as generation of batches and chunking. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

    #### Alternatives

    -   Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
    -   Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
    -   Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.

## 2.5.0

### Minor Changes

-   Signal telemetry events details ([#22804](https://github.com/microsoft/FluidFramework/pull/22804)) [e6566f6358](https://github.com/microsoft/FluidFramework/commit/e6566f6358551b5e579637de6c111d42281f7716)

    Properties of `eventName`s beginning "fluid:telemetry:ContainerRuntime:Signal" are updated to use `details` for all event specific information. Additional per-event changes:

    -   SignalLatency: shorten names now that data is packed into details. Renames:
        -   `signalsSent` -> `sent`
        -   `signalsLost` -> `lost`
        -   `outOfOrderSignals` -> `outOfOrder`
    -   SignalLost/SignalOutOfOrder: rename `trackingSequenceNumber` to `expectedSequenceNumber`
    -   SignalOutOfOrder: rename `type` to `contentsType` and only emit it some of the time

    > [!IMPORTANT]
    > Reminder: the naming and structure of telemetry events are not considered a part of the public API and may change at any time.

## 2.4.0

### Minor Changes

-   The `op.contents` member on ContainerRuntime's `batchBegin`/`batchEnd` event args is deprecated ([#22750](https://github.com/microsoft/FluidFramework/pull/22750)) [de6928b528](https://github.com/microsoft/FluidFramework/commit/de6928b528ceb115b12cdf7a4183077cbaa80a71)

    The `batchBegin`/`batchEnd` events on ContainerRuntime indicate when a batch is beginning/finishing being processed.
    The events include an argument of type `ISequencedDocumentMessage` which is the first or last message of the batch.

    The `contents` property of the `op` argument should not be used when reasoning over the begin/end of a batch.
    If you want to look at the `contents` of an op, wait for the `op` event.

## 2.3.0

### Minor Changes

-   Restored old op processing behavior around batched ops to avoid potential regression ([#22508](https://github.com/microsoft/FluidFramework/pull/22508)) [709f085c580](https://github.com/microsoft/FluidFramework/commit/709f085c5802bb4ad80145911ca3b05e457e9d6e)

    There's a theoretical risk of indeterminate behavior due to a recent change to how batches of ops are processed.
    This fix reverses that change.

    Pull Request #21785 updated the ContainerRuntime to hold onto the messages in an incoming batch until they've all arrived, and only then process the set of messages.

    While the batch is being processed, the DeltaManager and ContainerRuntime's view of the latest sequence numbers will be
    out of sync. This may have unintended side effects, so out of an abundance of caution we're reversing this behavior until
    we can add the proper protections to ensure the system stays properly in sync.

## 2.2.0

### Minor Changes

-   gcThrowOnTombstoneUsage and gcTombstoneEnforcementAllowed are deprecated ([#21992](https://github.com/microsoft/FluidFramework/pull/21992)) [b2bfed3a62](https://github.com/microsoft/FluidFramework/commit/b2bfed3a624d590d776c64a3317c60400b4b3e81)

    These properties `gcThrowOnTombstoneUsage` and `gcTombstoneEnforcementAllowed` have been deprecated in
    `IFluidParentContext` and `ContainerRuntime`. These were included in certain garbage collection (GC) telemetry to
    identify whether the corresponding features have been enabled. These features are now enabled by default and this
    information is added to the "GarbageCollectorLoaded" telemetry.

    Also, the following Garbage collection runtime options and configs have been removed. They were added during GC feature
    development to roll out and control functionalities. The corresponding features are on by default and can no longer be
    disabled or controlled:

    GC runtime options removed:

    -   `gcDisableThrowOnTombstoneLoad`
    -   `disableDataStoreSweep`

    GC configs removed:

    -   `"Fluid.GarbageCollection.DisableTombstone"`
    -   `"Fluid.GarbageCollection.ThrowOnTombstoneUsage"`
    -   `"Fluid.GarbageCollection.DisableDataStoreSweep"`

-   InactiveResponseHeaderKey header is deprecated ([#22107](https://github.com/microsoft/FluidFramework/pull/22107)) [2e4e9b2cfc](https://github.com/microsoft/FluidFramework/commit/2e4e9b2cfcdd7f5d2aa460ab9dedabd6dc2b20ba)

    The header `InactiveResponseHeaderKey` is deprecated and will be removed in the future. It was part of an experimental feature where loading an inactive data store would result in returning a 404 with this header set to true. This feature is no longer supported.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   fluid-framework: Type Erase ISharedObjectKind ([#21081](https://github.com/microsoft/FluidFramework/pull/21081)) [78f228e370](https://github.com/microsoft/FluidFramework/commit/78f228e37055bd4d9a8f02b3a1eefebf4da9c59c)

    A new type, `SharedObjectKind` is added as a type erased version of `ISharedObjectKind` and `DataObjectClass`.

    This type fills the role of both `ISharedObjectKind` and `DataObjectClass` in the `@public` "declarative API" exposed in the `fluid-framework` package.

    This allows several types referenced by `ISharedObjectKind` to be made `@alpha` as they should only need to be used by legacy code and users of the unstable/alpha/legacy "encapsulated API".

    Access to these now less public types should not be required for users of the `@public` "declarative API" exposed in the `fluid-framework` package, but can still be accessed for those who need them under the `/legacy` import paths.
    The full list of such types is:

    -   `SharedTree` as exported from `@fluidframwork/tree`: It is still exported as `@public` from `fluid-framework` as `SharedObjectKind`.
    -   `ISharedObjectKind`: See new `SharedObjectKind` type for use in `@public` APIs.
        `ISharedObject`
    -   `IChannel`
    -   `IChannelAttributes`
    -   `IChannelFactory`
    -   `IExperimentalIncrementalSummaryContext`
    -   `IGarbageCollectionData`
    -   `ISummaryStats`
    -   `ISummaryTreeWithStats`
    -   `ITelemetryContext`
    -   `IDeltaManagerErased`
    -   `IFluidDataStoreRuntimeEvents`
    -   `IFluidHandleContext`
    -   `IProvideFluidHandleContext`

    Removed APIs:

    -   `DataObjectClass`: Usages replaced with `SharedObjectKind`.
    -   `LoadableObjectClass`: Replaced with `SharedObjectKind`.
    -   `LoadableObjectClassRecord`: Replaced with `Record<string, SharedObjectKind>`.
    -

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

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

-   container-runtime: Make op grouping On by default [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Op grouping feature reduces number of ops on the wire by grouping all ops in a batch. This allows applications to substantially reduce chances of being throttled by service when sending a lot of ops.
    This feature could be enabled only by applications that have consumed 2.0.0-internal.7.0.2 version and have application version based on it saturated in the marker (to 99.99% or higher). Enabling it too soon will result on old client crashing when processing grouped ops.

    The feature has been proven in production in Loop app, as it was enabled through feature gates at 100% in PROD.
    All internal applications (Loop, Whiteboard) that send telemetry to our common Kusto tenant are already at or above minimal required version of runtime.

    If your application does not satisfy these deployment requirements, please disable op grouping via passing IContainerRuntimeOptions.enableGroupedBatching = false when calling ContainerRuntime.load().

### Minor Changes

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

-   driver-definitions: repositoryUrl removed from IDocumentStorageService ([#19522](https://github.com/microsoft/FluidFramework/issues/19522)) [90eb3c9d33](https://github.com/microsoft/FluidFramework/commits/90eb3c9d33d80e24caa1393a50f414c5602f6aa3)

    The `repositoryUrl` member of `IDocumentStorageService` was unused and always equal to the empty string. It has been removed.

-   Deprecated error-related enums have been removed ([#19067](https://github.com/microsoft/FluidFramework/issues/19067)) [59793302e5](https://github.com/microsoft/FluidFramework/commits/59793302e56784cfb6ace0e6469345f3565b3312)

    Error-related enums `ContainerErrorType`, `DriverErrorType`, `OdspErrorType` and `RouterliciousErrorType` were previously
    deprecated and are now removed. There are replacement object-based enumerations of `ContainerErrorTypes`,
    `DriverErrorTypes`, `OdspErrorTypes` and `RouterliciousErrorTypes`. Refer to the release notes of [Fluid Framework version
    2.0.0-internal.7.0.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.7.0.0) for details
    on the replacements.

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
