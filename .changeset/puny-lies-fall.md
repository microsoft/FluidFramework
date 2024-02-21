---
"@fluidframework/datastore-definitions": major
---

IFluidDataStoreRuntime.logger is now an ITelemetryBaseLogger

`IFluidDataStoreRuntime.logger` is now an `ITelemetryBaseLogger` instead of the deprecated `ITelemetryLogger`. The `sendTelemetryEvent()`, `sendErrorEvent()`, or `sendPerformanceEvent()` methods were not intended for users of `IFluidDataStoreRuntime`. You can keep using the logger's `send()` method to generate telemetry.
