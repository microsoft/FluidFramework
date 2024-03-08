---
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
---

container-loader: Behavior change: IContainer.attach will be made retriable in the next release

The `attach` function on IContainer has been modified such that the container stay open on non-fatal errors. On failure of attach the developer should inspect IContainer.closed to see if the container has been closed. If not closed, the developer can retry calling attach.

The functionality is currently behind a configuration `Fluid.Container.RetryOnAttachFailure` which can be set to `true` to enable the new functionality.

In the next release we will default to the new behavior, and it will be possible to disable this behavior by setting `Fluid.Container.RetryOnAttachFailure` to `false`
