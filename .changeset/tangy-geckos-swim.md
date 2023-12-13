---
"@fluidframework/container-loader": major
---

container-loader: Removed requestResolvedObjectFromContainer

The helper function `requestResolvedObjectFromContainer` has been removed. Please remove all calls to it and instead use
the new `entryPoint` pattern. See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
