# @fluidframework/data-object-base

## 2.11.0

Dependency updates only.

## 2.10.0

Dependency updates only.

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

-   data-object-base: LazyLoadedDataObject and LazyLoadedDataObjectFactory removed ([#19838](https://github.com/microsoft/FluidFramework/issues/19838)) [3bde9fc00b](https://github.com/microsoft/FluidFramework/commits/3bde9fc00bfb5271a88b0c20b94416add19d7a0a)

    LazyLoadedDataObject and LazyLoadedDataObjectFactory are not recommended for use and have been removed.

-   @fluidframework/data-object-base demoted to experimental status ([#19438](https://github.com/microsoft/FluidFramework/issues/19438)) [bbc812af86](https://github.com/microsoft/FluidFramework/commits/bbc812af8682c4cd1d6387d5708058c25a5c43a1)

    @fluidframework/data-object-base is now @fluid-experimental/data-object-base, and is not recommended for use in production. Prefer to use the data object classes from @fluidframework/aqueduct.

-   data-object-base: LazyLoadedDataObject and LazyLoadedDataObjectFactory deprecated ([#19482](https://github.com/microsoft/FluidFramework/issues/19482)) [c4c1e197cf](https://github.com/microsoft/FluidFramework/commits/c4c1e197cfdda1379b74b791dc1aef51aa3d7830)

    `LazyLoadedDataObject` and `LazyLoadedDataObjectFactory` have been deprecated and are not recommended for use. For lazy loading of data objects, prefer to defer dereferencing their handles.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

### Major Changes

-   data-object-base: Removed IFluidRouter from DataObject interfaces and classes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `IFluidRouter` property has been removed from a number of DataObject related classes:

    -   `PureDataObject`
    -   `LazyLoadedDataObject`
    -   `TestFluidObject`

    Please migrate to the new `entryPoint` pattern or use the relevant `request` method as necessary.

    See
    [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
    for more details.

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

-   `initializeEntryPoint` will become required [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The optional `initializeEntryPoint` method has been added to a number of constructors. **This method argument will become required in an upcoming release** and a value will need to be provided to the following classes:

    -   `BaseContainerRuntimeFactory`
    -   `ContainerRuntimeFactoryWithDefaultDataStore`
    -   `RuntimeFactory`
    -   `ContainerRuntime` (constructor and `loadRuntime`)
    -   `FluidDataStoreRuntime`

    For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L84).

    This work will replace the request pattern. See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more info on this effort.

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
