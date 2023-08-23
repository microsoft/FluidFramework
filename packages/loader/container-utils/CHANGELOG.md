# @fluidframework/container-utils

## 2.0.0-internal.6.1.0

### Minor Changes

-   Deprecates DeltaManagerProxyBase ([#16813](https://github.com/microsoft/FluidFramework/issues/16813)) [f4eca09824](https://github.com/microsoft/FluidFramework/commits/f4eca098248772a3ff2f408e225d425da47139a1)

    `DeltaManagerProxyBase` is only used internally in FluidFramework code and will no longer be exported in a future release.
    No replacement API is intended for external consumers.

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
