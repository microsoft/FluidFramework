---
"@fluidframework/aqueduct": major
"@fluidframework/container-runtime": major
"@fluidframework/data-object-base": major
"@fluidframework/request-handler": major
---

container-runtime: requestHandlers are deprecated

The concept of `requestHandlers` has been deprecated. Please migrate all usage of the following APIs to the new `entryPoint` pattern:

-   `requestHandler` property in `ContainerRuntime.loadRuntime(...)`
-   `RuntimeRequestHandler`
-   `RuntimeRequestHandlerBuilder`
-   `defaultFluidObjectRequestHandler(...)`
-   `defaultRouteRequestHandler(...)`
-   `mountableViewRequestHandler(...)`
-   `buildRuntimeRequestHandler(...)`
-   `createFluidObjectResponse(...)`
-   `handleFromLegacyUri(...)`
-   `rootDataStoreRequestHandler(...)`

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
