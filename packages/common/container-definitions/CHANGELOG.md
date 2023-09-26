# @fluidframework/container-definitions

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

-   allSentOpsAckd and processTime events removed from IDeltaManagerEvents [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The "allSentOpsAckd" and "processTime" events on the IDeltaManagerEvents interface were deprecated in 2.0.0-internal.2.2.0 and have now been removed.

-   IConnectionDetailsInternal and IDeltaHandlerStrategy removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IConnectionDetailsInternal and IDeltaHandlerStrategy from the @fluidframework/container-definitions package were deprecated in 2.0.0-internal.5.2.0 and have now been removed.

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

-   Loader container caching off by default [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Loader container caching will now be off by default and the ability to control it is deprecated. Loader caching is deprecated and will be removed in a future release, as well as all caching functionality of containers. Please try not to rely on caching and inform us if you cannot do so.

    If you run into trouble with this behavior, please report it ASAP to the FluidFramework team and use the following options (available in this release only) to unblock you:

    -   set `ILoaderProps.options.cache` to `true` when constructing a `Loader` object (see the `ILoaderOptions` interface)
    -   set `[LoaderHeader.cache]` header to `true` when requesting a container

-   contextChanged event on IContainerEvents removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The contextChanged event on IContainerEvents was deprecated in 2.0.0-internal.2.2.0 and has now been removed.

-   ICodeAllowList interface removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The ICodeAllowList interface was deprecated in 2.0.0-internal.3.2.0 and has now been removed.

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

-   IContainerContext members removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IContainerContext members disposed, dispose(), serviceConfiguration, and id were deprecated in 2.0.0-internal.5.2.0 and have now been removed.

## 2.0.0-internal.5.4.0

### Minor Changes

-   `ILoaderOptions.cache` has been deprecated ([#16383](https://github.com/microsoft/FluidFramework/issues/16383)) [ef9b00f1bf](https://github.com/microsoft/FluidFramework/commits/ef9b00f1bf538861ecc616c7c9e1d73707ab89fb)

    `ILoaderOptions.cache` has been deprecated and will be removed in a future release, as well as all caching functionality of containers. Cache support will be removed soon, please try not to rely on caching, and inform us if you cannot do so.

## 2.0.0-internal.5.3.0

### Minor Changes

-   Move closeAndGetPendingLocalState to IContainerExperimental ([#16302](https://github.com/microsoft/FluidFramework/issues/16302)) [93151af787](https://github.com/microsoft/FluidFramework/commits/93151af787b76e547cf3460df47f81832131db8c)

    This change deprecates the experimental method closeAndGetPendingLocalState on IContainer and moves it to IContainerExperimental.
    IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
    Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate on and finalize our experimental features.
    Experimental features should not be used in production environments.

-   IDeltaManager members disposed and dispose() deprecated ([#16224](https://github.com/microsoft/FluidFramework/issues/16224)) [85b30b686a](https://github.com/microsoft/FluidFramework/commits/85b30b686a47563baf00ded97986610f1f3e77ed)

    Directly calling dispose() on the IDeltaManager puts the system in an inconsistent state, and inspecting the disposed state of the IDeltaManager is not recommended (instead, prefer to inspect either the IContainer.disposed, IContainerRuntime.disposed, or IFluidDataStoreRuntime.disposed depending on your scenario). These members have been deprecated from the interface and will be removed in an upcoming release.

## 2.0.0-internal.5.2.0

### Minor Changes

-   IContainerContext members deprecated ([#16180](https://github.com/microsoft/FluidFramework/issues/16180)) [bf6a26cfe6](https://github.com/microsoft/FluidFramework/commits/bf6a26cfe6ac58386f2c9af260603a15b03ba84f)

    IContainerContext members disposed, dispose(), serviceConfiguration, and id have been deprecated and will be removed in an upcoming release.

    disposed - The disposed state on the IContainerContext is not meaningful to the runtime.

    dispose() - The runtime is not permitted to dispose the IContainerContext, this results in an inconsistent system state.

    serviceConfiguration - This property is redundant, and is unused by the runtime. The same information can be found via `deltaManager.serviceConfiguration` on this object if it is necessary.

    id - The docId is already logged by the IContainerContext.taggedLogger for telemetry purposes, so this is generally unnecessary for telemetry. If the id is needed for other purposes it should be passed to the consumer explicitly.

-   IConnectionDetailsInternal and IDeltaHandlerStrategy deprecated ([#16081](https://github.com/microsoft/FluidFramework/issues/16081)) [279dcd5563](https://github.com/microsoft/FluidFramework/commits/279dcd55635b650494cf2347f21cf0e2b979413a)

    The IConnectionDetailsInternal and IDeltaHandlerStrategy interfaces from the @fluidframework/container-definitions package have been deprecated and will be removed in a future release. These are internal-only interfaces and should not be used.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

### Major Changes

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

Dependency updates only.
