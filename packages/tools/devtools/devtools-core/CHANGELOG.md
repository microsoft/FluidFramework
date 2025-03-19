# @fluidframework/devtools-core

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

### Minor Changes

-   API clarifications for devtools packages ([#23165](https://github.com/microsoft/FluidFramework/pull/23165)) [cea34d10d0](https://github.com/microsoft/FluidFramework/commit/cea34d10d0f816335ab1b88b190940046ae7b696)

    APIs that were never intended for direct consumer use have been marked as `@system`.
    These are:

    -   HasContainerKey

    APIs that were not intended to be extended by consumers have been marked as `@sealed`.
    These are:

    -   ContainerDevtoolsProps
    -   DevtoolsProps
    -   HasContainerKey
    -   IDevtools

    Additionally, interface properties have been marked as `readonly`.

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

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

Dependency updates only.

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

-   container-definitions: Added containerMetadata prop on IContainer interface ([#19142](https://github.com/microsoft/FluidFramework/issues/19142)) [d0d77f3516](https://github.com/microsoft/FluidFramework/commits/d0d77f3516d67f3c9faedb47b20dbd4e309c3bc2)

    Added `containerMetadata` prop on IContainer interface.

-   runtime-definitions: Moved ISignalEnvelope interface to core-interfaces ([#19142](https://github.com/microsoft/FluidFramework/issues/19142)) [d0d77f3516](https://github.com/microsoft/FluidFramework/commits/d0d77f3516d67f3c9faedb47b20dbd4e309c3bc2)

    The `ISignalEnvelope` interface has been moved to the @fluidframework/core-interfaces package.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

### Major Changes

-   datastore-definitions: Jsonable and Serializable now require a generic parameter [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `Jsonable` and `Serializable` types from @fluidframework/datastore-definitions now require a generic parameter and
    if that type is `any` or `unknown`will return a new result `JsonableTypeWith<>` that more accurately represents the
    limitation of serialization.

    Additional modifications:

    -   `Jsonable`'s `TReplacement` parameter default has also been changed from `void` to `never`, which now disallows
        `void`.
    -   Unrecognized primitive types like `symbol` are now filtered to `never` instead of `{}`.
    -   Recursive types with arrays (`[]`) are now supported.

    `Serializable` is commonly used for DDS values and now requires more precision when using them. For example SharedMatrix
    (unqualified) has an `any` default that meant values were `Serializable<any>` (i.e. `any`), but now `Serializable<any>`
    is `JsonableTypeWith<IFluidHandle>` which may be problematic for reading or writing. Preferred correction is to specify
    the value type but casting through `any` may provide a quick fix.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

### Minor Changes

-   tree2: Rename "Value" Multiplicity and FieldKind ([#17622](https://github.com/microsoft/FluidFramework/issues/17622)) [bb68aeb30c](https://github.com/microsoft/FluidFramework/commits/bb68aeb30cfb3d4e0e82f04f1771ad4cb69e23af)

    `Multiplicity.Value` has been renamed to `Multiplicity.Single` and `FieldKinds.value` has been renamed to `FieldKinds.required`.

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

Dependency updates only.

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

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
