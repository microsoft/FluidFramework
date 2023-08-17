# @fluidframework/telemetry-utils

## 2.0.0-internal.6.1.0

### Minor Changes

-   Removed `TelemetryNullLogger` class is again exported from @fluidframework/telemetry-utils ([#16841](https://github.com/microsoft/FluidFramework/issues/16841)) [697f46a838](https://github.com/microsoft/FluidFramework/commits/697f46a838706a046c402ba96624b8f07ebc3b07)

    The `TelemetryNullLogger` class has been brought back to ease the transition to `2.0.0-internal.6.x`
    _but is still deprecated_ and will be removed in `2.0.0-internal.7.0.0`.

    For internal use within the FluidFramework codebase, use `createChildLogger()` with no arguments instead.
    For external consumers we recommend writing a trivial implementation of `ITelemetryBaseLogger`
    (from the `@fluidframework/core-interfaces` package) where the `send()` method does nothing and using that.

## 2.0.0-internal.6.0.0

### Major Changes

-   Remove Deprecated Loggers [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    This change removes the previously deprecated logger implementations. The following replacements are available:

    -   replace ChildLogger.create, new TelemetryNullLogger, and new BaseTelemetryNullLogger with createChildLogger
    -   replace new MultiSinkLogger with createMultiSinkLogger
    -   replace TelemetryUTLogger with MockLogger
    -   DebugLogger has no intended replacement

-   MockLogger is no longer a TelemetryLogger [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    TelemetryLogger was deprecated and has now been removed, so MockLogger can no longer inherit from it. MockLogger is now a ITelemetryBaseLogger, to get an ITelemetryLogger, or ITelemetryLoggerExt there is a new convenience method, `MockLogger.toTelemetryLogger()`

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

### Minor Changes

-   Deprecate Internal TelemetryLogger Implementations ([#16385](https://github.com/microsoft/FluidFramework/issues/16385)) [64023cacb1](https://github.com/microsoft/FluidFramework/commits/64023cacb13767c46c0472ecc22559aaad67adad)

    This change deprecates our internal TelemetryLogger implementations and unifies our exported and consumed surface area on our telemetry interfaces.

    For the deprecated implementations the following replacement function should be used:

    -   replace ChildLogger.create, new TelemetryNullLogger, and new BaseTelemetryNullLogger with createChildLogger
    -   replace new MultiSinkLogger with createMultiSinkLogger
    -   replace TelemetryUTLogger with MockLogger
    -   DebugLogger.create will be made internal with no intended replacement

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

### Minor Changes

-   Logger interface now supports logging a flat object ([#15759](https://github.com/microsoft/FluidFramework/issues/15759)) [8ae4fe32b1](https://github.com/microsoft/FluidFramework/commits/8ae4fe32b11d9bdfe6d2d43950970c95bdc660a6)

    The internal logger interface used when instrumenting the code now supports logging a flat object,
    which will be JSON.stringified before being sent to the host's base logger.
    This is technically a breaking change but based on typical logger configuration, should not require any changes to accommodate.

## 2.0.0-internal.5.0.0

### Major Changes

-   `ITelemetryLoggerExt` is a replacement for `ITelemetryLogger`, which adds additional types that can be logged as property values. ([#15667](https://github.com/microsoft/FluidFramework/pull-requests/15667)) [8c851e4c4b](https://github.com/microsoft/FluidFramework/commits/8c851e4c4b9a18a5189ace0608a1d8c3190a606b)
    This interface is not expected to be used outside the codebase, and all Logger implementations already use the new interface.
    In this release, the new type is used throughout the codebase to allow richer instrumentation.

    It's unlikely this will manifest as a break to consumers of the package, but it's not impossible.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
