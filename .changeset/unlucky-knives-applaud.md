---
"@fluidframework/container-runtime": major
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

Calling `IContainer.close(...)` will no longer dispose the container runtime, document service, or document storage service.

If the container is not expected to be used after the `close(...)` call, replace it instead with a
`IContainer.dispose(...)` call (this should be the most common case). Using `IContainer.dispose(...)` will no longer
switch the container to "readonly" mode and relevant code should instead listen to the Container's "disposed" event.

If you intend to pass your own critical error to the container, use `IContainer.close(...)`. Once you are done using the
container, call `IContainer.dispose(...)`.

See the [Closure](packages/loader/container-loader/README.md#Closure) section of Loader README.md for more details.
