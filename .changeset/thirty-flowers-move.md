---
"@fluidframework/telemetry-utils": major
---

Internal telemetry types removed from public API surface

We have updated the tags for the following telemetry-related types in the FluidFramework: TelemetryEventCategory, TelemetryEventPropertyTypeExt, ITelemetryPropertiesExt, ITelemetryGenericEventExt, ITelemetryErrorEventExt, ITelemetryPerformanceEventExt, ITelemetryLoggerExt. For developers using any of these types, the primary action required is to transition to using the corresponding "base" type. For example, replace ITelemetryPerformanceEventExt with ITelemetryBaseEvent from @core-interfaces.
