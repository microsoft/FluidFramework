# @fluidframework/odsp-driver-definitions

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

### Minor Changes

-   New interfaces to discover getRelaySessionInfo API ([#16300](https://github.com/microsoft/FluidFramework/issues/16300)) [a25789cd37](https://github.com/microsoft/FluidFramework/commits/a25789cd37bf60ebc4a08e1a9f7eaa8c65f4eae2)

    There are new interfaces `IRelaySessionAwareDriverFactory` and `IProvideSessionAwareDriverFactory` in
    odsp-driver-definitions that enable using the provider pattern to discover the new API `getRelaySessionInfo` in
    odsp-driver.

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
