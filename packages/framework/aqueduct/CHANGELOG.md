# @fluidframework/aqueduct

## 2.0.0-internal.8.0.0

### Major Changes

-   aqueduct: Removed getDefaultObjectFromContainer, getObjectWithIdFromContainer and getObjectFromContainer [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `getDefaultObjectFromContainer`, `getObjectWithIdFromContainer` and `getObjectFromContainer` helper methods have been removed from @fluidframework/aqueduct. Please move all code usage to the new `entryPoint` pattern.

    See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

-   data-object-base: Removed IFluidRouter from DataObject interfaces and classes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `IFluidRouter` property has been removed from a number of DataObject related classes:

    -   `PureDataObject`
    -   `LazyLoadedDataObject`
    -   `TestFluidObject`

    Please migrate to the new `entryPoint` pattern or use the relevant `request` method as necessary.

    See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

-   aqueduct: Removed IRootDataObjectFactory [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `IRootDataObjectFactory` interface has been removed. Please remove all usage of it.

-   aqueduct: Removed requestHandler utilities [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The following `requestHandler` utilities have been removed:

    -   `makeModelRequestHandler`
    -   `defaultFluidObjectRequestHandler`
    -   `defaultRouteRequestHandler`
    -   `mountableViewRequestHandler`
    -   `createFluidObjectResponse`
    -   `rootDataStoreRequestHandler`
    -   `handleFromLegacyUri`
    -   `RuntimeRequestHandlerBuilder`

    Please migrate all usage to the new `entryPoint` pattern.

    See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

## 2.0.0-internal.7.4.0

### Minor Changes

-   aqueduct: Deprecated IRootDataObjectFactory ([#18565](https://github.com/microsoft/FluidFramework/issues/18565)) [030ab7adf9](https://github.com/microsoft/FluidFramework/commits/030ab7adf991d2d983437544600a191ac15ca5a5)

    The `IRootDataObjectFactory` interface has been deprecated and will be removed in a future major release. Please remove
    all usage of it.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

-   aqueduct: ContainerRuntimeFactory constructors have changed [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The following class constructors have been changed to allow for better flexible in arguments passed:

    -   `BaseContainerRuntimeFactory`
    -   `ContainerRuntimeFactoryWithDefaultDataStore`
    -   `RuntimeFactory`

    They now use a single object for constructor params. Example change to be made:

    ```ts
    // Old
    new BaseContainerRuntimeFactory(
    	myRegistryEntries,
    	myDependencyContainer,
    	myRequestHandlers,
    	myRuntimeOptions,
    	myProvideEntryPoint,
    );

    // New
    new BaseContainerRuntimeFactory({
    	registryEntries: myRegistryEntries,
    	dependencyContainer: myDependencyContainer,
    	requestHandlers: myRequestHandlers,
    	runtimeOptions: myRuntimeOptions,
    	provideEntryPoint: myProvideEntryPoint,
    });
    ```

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

-   aqueduct: EventForwarder and IDisposable members removed from PureDataObject [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The `EventForwarder` and `IDisposable` members of `PureDataObject` were deprecated in 2.0.0-internal.5.2.0 and have now been removed.

    If your code was overriding any methods/properties from `EventForwarder` and or `IDisposable` on a class that inherits
    (directly or transitively) from `PureDataObject`, you'll have to remove the `override` keyword.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

### Minor Changes

-   PureDataObject temporarily extends EventForwarder and implements IDisposable again ([#16846](https://github.com/microsoft/FluidFramework/issues/16846)) [9825a692dd](https://github.com/microsoft/FluidFramework/commits/9825a692dd27eded214e3978a7fd6028b05e6fab)

    `PureDataObject` extends `EventForwarder` and implements `IDìsposable` again to ease the transition to `2.0.0-internal.6.x`.
    These interfaces will no longer be implemented on `PureDataObject` in version `2.0.0-internal.7.0.0`.

    The original deprecation announcement for these members can be found [here](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.5.2.0).

    Once the change is re-applied in `2.0.0-internal.7.0.0`, if your code was overriding any methods/properties from
    `EventForwarder` and or `IDisposable` on a class that inherits (directly or transitively) from `PureDataObject`,
    you'll have to remove the `override` keyword.

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

-   `initializeEntryPoint` will become required [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The optional `initializeEntryPoint` method has been added to a number of constructors. **This method argument will become required in an upcoming release** and a value will need to be provided to the following classes:

    -   `BaseContainerRuntimeFactory`
    -   `ContainerRuntimeFactoryWithDefaultDataStore`
    -   `RuntimeFactory`
    -   `ContainerRuntime` (constructor and `loadRuntime`)
    -   `FluidDataStoreRuntime`

    For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L84).

    This work will replace the request pattern. See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more info on this effort.

-   EventForwarder and IDisposable members removed from PureDataObject [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The EventForwarder and IDisposable members of PureDataObject were deprecated in 2.0.0-internal.5.2.0 and have now been removed.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

### Minor Changes

-   EventForwarder and IDisposable members deprecated from PureDataObject ([#16201](https://github.com/microsoft/FluidFramework/issues/16201)) [0e838fdb3e](https://github.com/microsoft/FluidFramework/commits/0e838fdb3e8187481f41c4116a67458c2a1658d5)

    The EventForwarder and IDisposable members have been deprecated from PureDataObject and will be removed in an upcoming release. The EventForwarder pattern was mostly unused by the current implementation, and is also recommended against generally (instead, register and forward events explicitly). The disposal implementation was incomplete and likely to cause poor behavior as the disposal was not observable by default. Inheritors of the PureDataObject can of course still implement their own disposal logic.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

### Major Changes

-   The following functions and classes were deprecated in previous releases and have been removed: [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    -   `PureDataObject.getFluidObjectFromDirectory`
    -   `IProvideContainerRuntime` and its `IContainerRuntime` member.
    -   `ContainerRuntime`'s `IProvideContainerRuntime` has also been removed.

## 2.0.0-internal.4.4.0

### Minor Changes

-   `PureDataObject.getFluidObjectFromDirectory` has been deprecated and will be removed in an upcoming release. Instead prefer to interface directly with the directory and handles. [9238304c77](https://github.com/microsoft/FluidFramework/commits/9238304c772d447225f6f86417033ca8004c0edd)

## 2.0.0-internal.4.1.0

Dependency updates only.
