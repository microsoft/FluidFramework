---
"@fluidframework/container-runtime": major
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

IContainer.dispose is now required

`IContainer.dispose` is now a required method. This method should dispose any resources and switch the container to a
permanently disconnected state.

Please see the
[Closure](https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-loader/README.md#closure)
section of Loader README.md for more details.
