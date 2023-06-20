# @fluidframework/container-definitions

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
