# @fluidframework/runtime-definitions

## 2.30.0

### Minor Changes

-   The process and processDocumentSchemaOp functions have been removed ([#24018](https://github.com/microsoft/FluidFramework/pull/24018)) [bc35d543d5](https://github.com/microsoft/FluidFramework/commit/bc35d543d58c7e4bf28944b09d645cc26bf28a29)

    `process` has been replaced by `processMessages` from the following:

    -   `FluidDataStoreRuntime`
    -   `IDeltaHandler`
    -   `IFluidDataStoreChannel`
    -   `MockFluidDataStoreRuntime`
    -   `MockDeltaConnection`

    `processDocumentSchemaOp` has been replaced by `processDocumentSchemaMessages` from `DocumentsSchemaController`.

    See the [deprecation release note](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.5.0#user-content-the-process-function-on-ifluiddatastorechannel-ideltahandler-mockfluiddatastoreruntime-and-mockdeltaconnection-is-now-deprecated-22840) for more details.

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

### Minor Changes

-   The createDataStoreWithProps APIs on ContainerRuntime and IContainerRuntimeBase have been removed ([#22996](https://github.com/microsoft/FluidFramework/pull/22996)) [bd243fb292](https://github.com/microsoft/FluidFramework/commit/bd243fb2927915d87c42486e21ee0c990962a9a7)

    `ContainerRuntime.createDataStoreWithProps` and `IContainerRuntimeBase.createDataStoreWithProps`
    were [deprecated in version 0.25.0](https://github.com/microsoft/FluidFramework/blob/main/BREAKING.md#icontainerruntimebase_createdatastorewithprops-is-removed) and have been removed.

    Replace uses of these APIs with `PureDataObjectFactory.createInstanceWithDataStore` and pass in props via the `initialState`
    parameter.

    These changes were originally announced in version 0.25.0. See the following issues for more details:

    -   [#1537](https://github.com/microsoft/FluidFramework/issues/1537)
    -   [#2931](https://github.com/microsoft/FluidFramework/pull/2931)

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

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

-   Changes to the batchBegin and batchEnd events on ContainerRuntime ([#22791](https://github.com/microsoft/FluidFramework/pull/22791)) [d252af539a](https://github.com/microsoft/FluidFramework/commit/d252af539afc2b44d05db35cb94b4351b75d9432)

    The 'batchBegin'/'batchEnd' events on ContainerRuntime indicate when a batch is beginning or finishing being processed. The `contents` property on the event argument `op` is not useful or relevant when reasoning over incoming changes at the batch level. Accordingly, it has been removed from the `op` event argument.

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

-   The op event on IFluidDataStoreRuntimeEvents and IContainerRuntimeBaseEvents is emitted at a different time ([#22840](https://github.com/microsoft/FluidFramework/pull/22840)) [2e5b969d3a](https://github.com/microsoft/FluidFramework/commit/2e5b969d3a28b05da1502d521b725cee66e36a15)

    Previously, in versions 2.4 and below, the `op` event was emitted immediately after an op was processed and before the next op was processed.

    In versions 2.5.0 and beyond, the `op` event will be emitted after an op is processed, but it may not be immediate. In addition, other ops in a
    batch may be processed before the op event is emitted for a particular op.

-   The process function on IFluidDataStoreChannel, IDeltaHandler, MockFluidDataStoreRuntime and MockDeltaConnection is now deprecated ([#22840](https://github.com/microsoft/FluidFramework/pull/22840)) [2e5b969d3a](https://github.com/microsoft/FluidFramework/commit/2e5b969d3a28b05da1502d521b725cee66e36a15)

    The process function on IFluidDataStoreChannel, IDeltaHandler, MockFluidDataStoreRuntime and MockDeltaConnection is now
    deprecated. It has been replaced with a new function `processMessages`, which will be called to process multiple messages instead of a single one on the channel. This is part of a feature called "Op bunching", where contiguous ops of a given type and to a given data store / DDS are bunched and sent together for processing.

    Implementations of `IFluidDataStoreChannel` and `IDeltaHandler` must now also implement `processMessages`. For reference implementations, see `FluidDataStoreRuntime::processMessages` and `SharedObjectCore::attachDeltaHandler`.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

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

-   runtime-definitions: Remove deprecated 'get' and 'serialize' members on the ITelemetryContext interface ([#21009](https://github.com/microsoft/FluidFramework/pull/21009)) [c0483b49a3](https://github.com/microsoft/FluidFramework/commit/c0483b49a31df87b3a7d3eafd4175efd5eb1762f)

    The `ITelemetryContext` interface was not intended to allow getting properties that had been added to it, so it is now "write-only". Internal usage within FluidFramework should use the new `ITelemetryContextExt`.

-   runtime-definitions: Make IInboundSignalMessage alpha and readonly ([#21226](https://github.com/microsoft/FluidFramework/pull/21226)) [1df91dd844](https://github.com/microsoft/FluidFramework/commit/1df91dd844bebcb6c837370827b244a01eca8295)

    Users of `IInboundSignalMessage` will need to import it from the `/legacy` scope and should not mutate it.
    Only users of existing `@alpha` APIs like `IFluidDataStoreRuntime` should be able to use this type, so it should not introduce new `/legacy` usage.

## 2.0.0-rc.4.0.0

### Minor Changes

-   Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
    Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

    External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
    Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
    Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

## 2.0.0-rc.3.0.0

### Major Changes

-   runtime-definitions: IFluidDataStoreContext no longer raises events, IFluidDataStoreChannel needs to implement new method [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    This change could be ignored, unless you have custom implementations of IFluidDataStoreChannel or listened to IFluidDataStoreContext's "attached" or "attaching" events

    IFluidDataStoreContext no longer raises events. Instead, it will call IFluidDataStoreChannel.setAttachState().
    If you are implementing data store runtme, please implement setAttachState() API and rely on this flow.
    If you are not data store developer, and were reaching out to context, then please stop doing it - the only purpose of IFluidDataStoreContext is
    communication with IFluidDataStoreChannel. Context object should not be exposed by impplementers of IFluidDataStoreChannel.
    If you are using stock implementations of IFluidDataStoreChannel, you can listen for same events on IFluidDataStoreRuntime instead.

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

-   runtime-definitions: ITelemetryContext: Functions `get` and `serialize` are now deprecated ([#19409](https://github.com/microsoft/FluidFramework/issues/19409)) [42696564dd](https://github.com/microsoft/FluidFramework/commits/42696564ddbacfe200d653bdf7a1db18fc253bfb)

    ITelemetryContext is to be used only for instrumentation, not for attempting to read the values already set by other code.
    This is important because this _public_ interface may soon use FF's _should-be internal_ logging instrumentation types,
    which we reserve the right to expand (to support richer instrumentation).
    In that case, we would not be able to do so in a minor release if they're used as an "out" type
    like the return type for `get`.

    There is no replacement given in terms of immediate programmatic access to this data.
    The expected use pattern is something like this:

    -   Some code creates a concrete implementation of `ITelemetryContext` and passes it around
    -   Callers use the "write" functions on the interface to build up the context
    -   The originator uses a function like `serialize` (on the concrete impl, not exposed on the interface any longer)
        and passes the result to a logger
    -   The data is inspected along with other logs in whatever telemetry pipeline is used by the application (or Debug Tools, etc)

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

-   runtime-definitions: FlushMode.Immediate is deprecated ([#19963](https://github.com/microsoft/FluidFramework/issues/19963)) [861500c1e2](https://github.com/microsoft/FluidFramework/commits/861500c1e2bdd3394308bd87007231d70b698be0)

    `FlushMode.Immediate` is deprecated and will be removed in the next major version. It should not be used. Use
    `FlushMode.TurnBased` instead, which is the default. See
    <https://github.com/microsoft/FluidFramework/tree/main/packages/runtime/container-runtime/src/opLifecycle#how-batching-works>
    for more information

-   container-definitions: ILoaderOptions no longer accepts arbitrary key/value pairs ([#19306](https://github.com/microsoft/FluidFramework/issues/19306)) [741926e225](https://github.com/microsoft/FluidFramework/commits/741926e2253a161504ecc6a6451d8f15d7ac4ed6)

    ILoaderOptions has been narrowed to the specific set of supported loader options, and may no longer be used to pass arbitrary key/value pairs through to the runtime.

-   runtime-definitions: Deprecated ID compressor related types have been removed. ([#19031](https://github.com/microsoft/FluidFramework/issues/19031)) [de92ef0ac5](https://github.com/microsoft/FluidFramework/commits/de92ef0ac551ad89b00564c78c0091f8ecc33639)

    This change should be a no-op for consumers, as these types were almost certainly unused and are also available in the
    standalone package id-compressor (see <https://github.com/microsoft/FluidFramework/pull/18749>).

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

-   garbage collection: Deprecate addedGCOutboundReference ([#18456](https://github.com/microsoft/FluidFramework/issues/18456)) [0619cf8a41](https://github.com/microsoft/FluidFramework/commits/0619cf8a4197bee6d5ac56cac05db92008939817)

    The `addedGCOutboundReference` property on IDeltaConnection, IFluidDataStoreContext, and MockFluidDataStoreRuntime is
    now deprecated.

    The responsibility of adding outbound references (for Garbage Collection tracking) is moving up to the ContainerRuntime.
    Previously, DDSes themselves were responsible to detect and report added outbound references (via a handle being stored),
    so these interfaces (and corresponding mock) needed to plumb that information up to the ContainerRuntime layer where GC sits.
    This is no longer necessary so they're being removed in an upcoming release.

## 2.0.0-internal.8.0.0

### Major Changes

-   container-runtime-definitions: Removed resolveHandle and IFluidHandleContext from ContainerRuntime interfaces [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `IContainerRuntime.resolveHandle(...)` method and the `IContainerRuntimeBase.IFluidHandleContext` property have been
    removed. Please remove all usage of these APIs.

    See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

-   container-runtime: Removed request pattern from ContainerRuntime, IRuntime, and IContainerRuntimeBase [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `request(...)` method and `IFluidRouter` property have been removed from the following places:

    -   `ContainerRuntime`
    -   `IRuntime`
    -   `IContainerRuntimeBase`

    Please use the `IRuntime.getEntryPoint()` method to get the runtime's entry point.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

-   runtime-definitions: Removed IFluidRouter from IFluidDataStoreChannel and FluidDataStoreRuntime [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `IFluidRouter` property has been removed from `IFluidDataStoreChannel` and `FluidDataStoreRuntime`. Please migrate
    all usage to the `IFluidDataStoreChannel.entryPoint` API.

    See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

-   runtime-definitions: Removed request and IFluidRouter from IDataStore [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `request` method and `IFluidRouter` property have been removed from `IDataStore`. Please migrate all usage to the `IDataStore.entryPoint` API.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

## 2.0.0-internal.7.4.0

### Minor Changes

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

-   runtime-definitions: `bindToContext` API removed [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    `bindToContext` has been removed from `FluidDataStoreRuntime`, `IFluidDataStoreContext` and
    `MockFluidDataStoreContext`. This has been deprecated for several releases and cannot be used anymore.

-   DEPRECATED: resolveHandle and IFluidHandleContext deprecated on IContainerRuntime [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The `resolveHandle(...)` and `get IFluidHandleContext()` methods have been deprecated on the following interfaces:

    -   `IContainerRuntime`
    -   `IContainerRuntimeBase`

    Requesting arbitrary URLs has been deprecated on `IContainerRuntime`. Please migrate all usage to the `IContainerRuntime.getEntryPoint()` method if trying to obtain the application-specified root object.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

-   container-definitions: IContainer's and IDataStore's IFluidRouter capabilities are deprecated [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    `IFluidRouter` and `request({ url: "/" })` on `IContainer` and `IDataStore` are deprecated and will be removed in a future major release. Please migrate all usage to the appropriate `getEntryPoint()` or `entryPoint` APIs.

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

## 2.0.0-internal.6.4.0

### Minor Changes

-   Upcoming: The type of the logger property/param in various APIs will be changing ([#17350](https://github.com/microsoft/FluidFramework/issues/17350)) [27284bcda3](https://github.com/microsoft/FluidFramework/commits/27284bcda3d63cc4306cf76806f8a075db0db60f)

    -   @fluidframework/runtime-definitions
        -   `IFluidDataStoreRuntime.logger` will be re-typed as `ITelemetryBaseLogger`
    -   @fluidframework/odsp-driver
        -   `protected OdspDocumentServiceFactoryCore.createDocumentServiceCore`'s parameter `odspLogger` will be re-typed as `ITelemetryLoggerExt`
        -   `protected LocalOdspDocumentServiceFactory.createDocumentServiceCore`'s parameter `odspLogger` will be re-typed as `ITelemetryLoggerExt`

    Additionally, several of @fluidframework/telemetry-utils's exports are being marked as internal and should not be consumed outside of other FF packages.

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

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

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

-   IContainer's and IDataStore's IFluidRouter capabilities are deprecated. [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    -   The `request` function taking an arbitrary URL and headers is deprecated
    -   However, an overload taking only `{ url: "/" }` is not, for back-compat purposes during the migration
        from the request pattern to using entryPoint.

    ### About requesting "/" and using entryPoint

    Requesting "/" is an idiom some consumers of Fluid Framework have used in their own `requestHandler`s
    (passed to `ContainerRuntime.loadRuntime` and `FluidDataStoreRuntime`'s constructor).
    The ability to access the "root" or "entry point" of a Container / DataStore will presently be provided by
    `IContainer.getEntryPoint` and `IDataStore.entryPoint`. However these are still optional, so a temporary workaround is needed.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more info on this transition from request to entryPoint.

    ### Present Replacement for requesting an arbitrary URL

    Suppose you have these variables:

    ```ts
    const container: IContainer = ...;
    const dataStore: IDataStore = ...;
    ```

    Before:

    ```ts
    container.request({ url, headers });
    dataStore.request({ url, headers });
    ```

    After:

    ```ts
    // Assume there is an interface like this in the app's Container implementation
    interface CustomUrlRouter {
    	doRequestRouting(request: { url: string; headers: Record<string, any>; }): any;
    }

    // Prerequisite: Pass a requestHandler to ContainerRuntime.loadRuntime that routes "/"
    // to some root object implementing CustomUrlRouter
    const containerRouter: CustomUrlRouter = await container.request({ "/" });
    containerRouter.doRequestRouting({ url, headers });

    // Prerequisite: Pass a requestHandler to FluidDataStoreRuntime's constructor that routes "/"
    // to some root object implementing CustomUrlRouter
    const dataStoreRouter: CustomUrlRouter = await dataStore.request({ "/" });
    dataStoreRouter.doRequestRouting({ url, headers });
    ```

    ### Looking ahead to using entryPoint

    In the next major release, `getEntryPoint` and `entryPoint` should be mandatory and available for use.
    Then you may replace each call `request({ url: "/" })` with a call to get the entryPoint using these functions/properties.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

-   IDeltaManager members disposed and dispose() removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IDeltaManager members disposed and dispose() were deprecated in 2.0.0-internal.5.3.0 and have now been removed.

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

-   GC interfaces removed from runtime-definitions [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    The following interfaces available in `@fluidframework/runtime-definitions` were deprecated in 2.0.0-internal.4.1.0 and are now removed.

    -   `IGarbageCollectionNodeData`
    -   `IGarbageCollectionState`
    -   `IGarbageCollectionSnapshotData`
    -   `IGarbageCollectionSummaryDetailsLegacy`

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
