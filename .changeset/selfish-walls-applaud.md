---
"@fluidframework/container-runtime": major
---

Calling `ContainerRuntime.closeFn(...)` will no longer call `ContainerContext.disposeFn(...)` as well

This means the `ContainerRuntime` will no longer be disposed by calling this method.

If you want to dispose the `ContainerRuntime`, use the `ContainerRuntime.disposeFn` method.

For more information about close vs. dispose expectations, see the [Closure](https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-loader/README.md#closure) section of Loader README.md.
