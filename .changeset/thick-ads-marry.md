---
"@fluid-example/example-utils": major
"@fluidframework/aqueduct": major
"@fluidframework/request-handler": major
---

Removed `requestHandler` utilities

The following `requestHandler` utilities have been removed:

-   `makeModelRequestHandler`
-   `defaultFluidObjectRequestHandler`
-   `defaultRouteRequestHandler`
-   `mountableViewRequestHandler`
-   `createFluidObjectResponse`
-   `rootDataStoreRequestHandler`
-   `handleFromLegacyUri`
-   `RuntimeRequestHandlerBuilder`

Please migrate all usage to the new `entryPoint` pattern.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.
