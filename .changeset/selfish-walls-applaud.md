---
"@fluidframework/container-runtime": major
---

Calling `ContainerRuntime.closeFn(...)` will no longer call `ContainerContext.disposeFn(...)` as well. This means the `ContainerRuntime` will no longer be disposed by calling this method.

To achieve the `ContainerRuntime` being disposed, use the exposed `ContainerRuntime.disposeFn` method.

For more information about close vs. dispose expectations, see the [Closure](packages/loader/container-loader/README.md#Closure) section of Loader README.md.
