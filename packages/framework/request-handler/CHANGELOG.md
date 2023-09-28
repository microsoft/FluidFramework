# @fluidframework/request-handler

## 2.0.0-internal.7.0.0

### Major Changes

-   DEPRECATED: container-runtime: requestHandlers are deprecated [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

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

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

### Minor Changes

-   Some stack traces are improved ([#17380](https://github.com/microsoft/FluidFramework/issues/17380)) [34f2808ee9](https://github.com/microsoft/FluidFramework/commits/34f2808ee9764aef21b990f8b48860d9e3ce27a5)

    Some stack traces have been improved and might now include frames for async functions that weren't previously included.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

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
