# @fluid-example/example-utils

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

Dependency updates only.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

Dependency updates only.

## 2.0.0-rc.4.0.0

Dependency updates only.

## 2.0.0-rc.3.0.0

Dependency updates only.

## 2.0.0-rc.2.0.0

### Minor Changes

-   @fluidframework/view-interfaces package removed ([#19713](https://github.com/microsoft/FluidFramework/issues/19713)) [e0205c0051](https://github.com/microsoft/FluidFramework/commits/e0205c00515d24808a4cca389b0303fc6d016b27)

    The view-interfaces package has been removed without replacement. The mountable view interfaces have been moved to the example-utils directory of the FluidFramework repo and may be used as a reference if needed, though this pattern is not recommended.

-   @fluid-experimental/react-inputs removed ([#19902](https://github.com/microsoft/FluidFramework/issues/19902)) [a7abf126ad](https://github.com/microsoft/FluidFramework/commits/a7abf126ad964dfe3e4894bdad90ab98f8421cfd)

    This package was experimental and has been removed. No replacement is provided, but the patterns from the example packages can be used to instruct binding to a view.

-   @fluid-tools/webpack-fluid-loader no longer published ([#19660](https://github.com/microsoft/FluidFramework/issues/19660)) [9030c2c57c](https://github.com/microsoft/FluidFramework/commits/9030c2c57c7e19ed2ae8603d2a09b519f5969592)

    The @fluid-tools/webpack-fluid-loader package is no longer published as it is not a recommended pattern. Please consult fluidframework.com for current example patterns.

-   @fluidframework/view-adapters package removed ([#19621](https://github.com/microsoft/FluidFramework/issues/19621)) [fbde842dbc](https://github.com/microsoft/FluidFramework/commits/fbde842dbc089ecda66ab0353cc67aa96fa19c31)

    The view-adapters package has been removed without replacement. The `MountableView` class has been moved to the example-utils directory of the FluidFramework repo and may be used as a reference if needed, though this pattern is not recommended.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

### Major Changes

-   aqueduct: Removed requestHandler utilities [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

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

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

Dependency updates only.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

Dependency updates only.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
