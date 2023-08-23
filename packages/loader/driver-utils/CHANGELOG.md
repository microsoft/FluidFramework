# @fluidframework/driver-utils

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   combineAppAndProtocolSummary removed from driver-utils [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    combineAppAndProtocolSummary was deprecated in 2.0.0-internal.3.4.0 and has now been removed.

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

### Minor Changes

-   The following classes have been moved from `@fluidframework/protocol-base` to `@fluidframework/driver-utils`: `BlobTreeEntry`, `TreeTreeEntry` and `AttachmentTreeEntry`. ([#15687](https://github.com/microsoft/FluidFramework/pull/15687)) [c0d2f364e8](https://github.com/microsoft/FluidFramework/commits/c0d2f364e830a7b62ec42999df8c45941f7f0a2c)

## 2.0.0-internal.4.1.0

Dependency updates only.
