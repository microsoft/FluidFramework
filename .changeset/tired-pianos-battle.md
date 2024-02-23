---
"@fluidframework/core-interfaces": major
---

Removed deprecated telemetry event types

The deprecated `ITelemetryErrorEvent`, `ITelemetryGenericEvent`, and `ITelemetryPerformanceEvent` interfaces,
which represented different kinds of telemetry events, were not intended for consumers of Fluid Framework and have thus
been removed.
`ITelemetryBaseEvent` is the only telemetry event interface that should be used in/by consuming code.

`ITelemetryLogger` was not intended for consumers of Fluid Framework and has been removed.
Consumers should use the simpler `ITelemetryBaseLogger` instead.
