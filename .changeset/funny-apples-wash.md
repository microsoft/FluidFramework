---
"@fluidframework/container-loader": major
"@fluidframework/runtime-utils": major
"@fluidframework/aqueduct": major
---

Various request related APIs have been deprecated

Please remove all calls to the following functions and instead use the new `entryPoint` pattern:

-   `requestFluidObject`
-   `requestResolvedObjectFromContainer`
-   `getDefaultObjectFromContainer`
-   `getObjectWithIdFromContainer`
-   `getObjectFromContainer`

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
