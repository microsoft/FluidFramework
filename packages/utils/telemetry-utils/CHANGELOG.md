# @fluidframework/telemetry-utils

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

### Minor Changes

-   telemetry-utils: Deprecate ConfigTypes and IConfigProviderBase ([#18597](https://github.com/microsoft/FluidFramework/issues/18597)) [39b9ff57c0](https://github.com/microsoft/FluidFramework/commits/39b9ff57c0184b72f0e3f9425922dda944995265)

    The types `ConfigTypes` and `IConfigProviderBase` have been deprecated in the @fluidframework/telemetry-utils package.
    The types can now be found in the @fluidframework/core-interfaces package. Please replace any uses with the types from
    @fluidframework/core-interfaces.

-   telemetry-utils: Deprecated logIfFalse ([#18047](https://github.com/microsoft/FluidFramework/issues/18047)) [57614ffdc6](https://github.com/microsoft/FluidFramework/commits/57614ffdc6e3fbd22ddbe5ed589c75d3d195aa48)

    This functionality was not intended for export and will be removed in a future release.
    No replacement API is offered because the logic is trivial to reproduce as needed.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

-   Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    This included the following changes from the protocol-definitions release:

    -   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
        submitted by clients to the server and the resulting signals sent from the server to clients.
        -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
            been added, which will be the typing for signals sent from the client to the server. Both extend a new
            ISignalMessageBase interface that contains common members.
    -   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

-   Server upgrade: dependencies on Fluid server packages updated to 2.0.1 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Dependencies on the following Fluid server package have been updated to version 2.0.1:

    -   @fluidframework/gitresources: 2.0.1
    -   @fluidframework/server-kafka-orderer: 2.0.1
    -   @fluidframework/server-lambdas: 2.0.1
    -   @fluidframework/server-lambdas-driver: 2.0.1
    -   @fluidframework/server-local-server: 2.0.1
    -   @fluidframework/server-memory-orderer: 2.0.1
    -   @fluidframework/protocol-base: 2.0.1
    -   @fluidframework/server-routerlicious: 2.0.1
    -   @fluidframework/server-routerlicious-base: 2.0.1
    -   @fluidframework/server-services: 2.0.1
    -   @fluidframework/server-services-client: 2.0.1
    -   @fluidframework/server-services-core: 2.0.1
    -   @fluidframework/server-services-ordering-kafkanode: 2.0.1
    -   @fluidframework/server-services-ordering-rdkafka: 2.0.1
    -   @fluidframework/server-services-ordering-zookeeper: 2.0.1
    -   @fluidframework/server-services-shared: 2.0.1
    -   @fluidframework/server-services-telemetry: 2.0.1
    -   @fluidframework/server-services-utils: 2.0.1
    -   @fluidframework/server-test-utils: 2.0.1
    -   tinylicious: 2.0.1

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

-   @fluidframework/container-utils package removed [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    All members of the **@fluidframework/container-utils** package have been deprecated and the package is now removed.

    Migration by API member:

    -   `ClientSessionExpiredError` (deprecated in `2.0.0-internal.6.2.0`): No replacement API offered.
    -   `DataCorruptionError` (deprecated in `2.0.0-internal.6.2.0`): Import from [@fluidframework/telemetry-utils](https://www.npmjs.com/package/@fluidframework/telemetry-utils) instead.
    -   `DataProcessingError` (deprecated in `2.0.0-internal.6.2.0`): Import from [@fluidframework/telemetry-utils](https://www.npmjs.com/package/@fluidframework/telemetry-utils) instead.
    -   `DeltaManagerProxyBase` (deprecated in `2.0.0-internal.6.1.0`): No replacement API offered.
    -   `extractSafePropertiesFromMessage` (deprecated in `2.0.0-internal.6.2.0`): Import from [@fluidframework/telemetry-utils](https://www.npmjs.com/package/@fluidframework/telemetry-utils) instead.
    -   `GenericError` (deprecated in `2.0.0-internal.6.2.0`): Import from [@fluidframework/telemetry-utils](https://www.npmjs.com/package/@fluidframework/telemetry-utils) instead.
    -   `ThrottlingWarning` (deprecated in `2.0.0-internal.6.2.0`): No replacement API offered.
    -   `UsageError` (deprecated in `2.0.0-internal.6.2.0`): Import from [@fluidframework/telemetry-utils](https://www.npmjs.com/package/@fluidframework/telemetry-utils) instead.

## 2.0.0-internal.6.4.0

### Minor Changes

-   Upcoming: The type of the logger property/param in various APIs will be changing ([#17350](https://github.com/microsoft/FluidFramework/issues/17350)) [27284bcda3](https://github.com/microsoft/FluidFramework/commits/27284bcda3d63cc4306cf76806f8a075db0db60f)

    -   @fluidframework/runtime-definitions
        -   `IFluidDataStoreRuntime.logger` will be re-typed as `ITelemetryBaseLogger`
    -   @fluidframework/odsp-driver
        -   `protected OdspDocumentServiceFactoryCore.createDocumentServiceCore`'s parameter `odspLogger` will be re-typed as `ITelemetryLoggerExt`
        -   `protected LocalOdspDocumentServiceFactory.createDocumentServiceCore`'s parameter `odspLogger` will be re-typed as `ITelemetryLoggerExt`

    Additionally, several of @fluidframework/telemetry-utils's exports are being marked as internal and should not be consumed outside of other FF packages.

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
