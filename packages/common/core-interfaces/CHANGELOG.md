# @fluidframework/core-interfaces

## 2.0.0-internal.6.3.0

### Minor Changes

-   Cleaning up duplicate or misnamed telemetry types ([#17149](https://github.com/microsoft/FluidFramework/issues/17149)) [f9236942fa](https://github.com/microsoft/FluidFramework/commits/f9236942faf03cde860bfcbc7c28f8fbd81d3868)

    We have two sets of telemetry-related interfaces:

    -   The "Base" ones
        -   These have a very bare API surface
        -   They are used on public API surfaces to transmit logs across layers
    -   The internal ones
        -   These have a richer API surface (multiple log functions with different categories,
            support for logging flat arrays and objects)
        -   They are used for instrumenting our code, and then normalize and pass off the logs via the Base interface

    There are two problems with the given state of the world:

    1. The "Base" ones were not named consistently, so the distinction was not as apparent as it could be
    2. The internal ones were copied to `@fluidframework/telemetry-utils` and futher extended, but the original duplicates remain.

    This change addresses these by adding "Base" to the name of each base type, and deprecating the old duplicate internal types.

    Additionally, the following types were adjusted:

    -   `TelemetryEventCategory` is moving from `@fluidframework/core-interfaces` to `@fluidframework/telemetry-utils`
    -   Several types modeling "tagged" telemetry properties are deprecated in favor of a generic type `Tagged<V>`

## 2.0.0-internal.6.2.0

### Minor Changes

-   Remove use of @fluidframework/common-definitions ([#16638](https://github.com/microsoft/FluidFramework/issues/16638)) [a8c81509c9](https://github.com/microsoft/FluidFramework/commits/a8c81509c9bf09cfb2092ebcf7265205f9eb6dbf)

    The **@fluidframework/common-definitions** package is being deprecated, so the following interfaces and types are now
    imported from the **@fluidframework/core-interfaces** package:

    -   interface IDisposable
    -   interface IErrorEvent
    -   interface IErrorEvent
    -   interface IEvent
    -   interface IEventProvider
    -   interface ILoggingError
    -   interface ITaggedTelemetryPropertyType
    -   interface ITelemetryBaseEvent
    -   interface ITelemetryBaseLogger
    -   interface ITelemetryErrorEvent
    -   interface ITelemetryGenericEvent
    -   interface ITelemetryLogger
    -   interface ITelemetryPerformanceEvent
    -   interface ITelemetryProperties
    -   type ExtendEventProvider
    -   type IEventThisPlaceHolder
    -   type IEventTransformer
    -   type ReplaceIEventThisPlaceHolder
    -   type ReplaceIEventThisPlaceHolder
    -   type TelemetryEventCategory
    -   type TelemetryEventPropertyType

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
