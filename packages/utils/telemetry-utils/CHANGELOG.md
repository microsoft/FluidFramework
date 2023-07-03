# @fluidframework/telemetry-utils

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
