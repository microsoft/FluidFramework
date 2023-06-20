# @fluidframework/container-loader

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
