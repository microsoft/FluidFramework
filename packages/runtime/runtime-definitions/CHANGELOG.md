# @fluidframework/runtime-definitions

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
