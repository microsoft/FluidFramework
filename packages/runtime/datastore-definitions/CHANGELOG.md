# @fluidframework/datastore-definitions

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

-   IChannel.owner removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The owner property on IChannel was deprecated in 2.0.0-internal.5.1.0 and has now been removed.

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

### Minor Changes

-   IChannel.owner deprecated ([#16024](https://github.com/microsoft/FluidFramework/issues/16024)) [92997468e7](https://github.com/microsoft/FluidFramework/commits/92997468e72c48ff39afb9e15fcdca4e87ac8dca)

    The owner property on IChannel has been deprecated and will be removed in an upcoming release. This property does nothing.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
