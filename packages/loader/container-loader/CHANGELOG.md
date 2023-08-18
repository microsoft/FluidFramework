# @fluidframework/container-loader

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
