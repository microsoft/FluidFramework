---
"@fluidframework/telemetry-utils": minor
"__section": deprecation
---
Deprecate ITelemetryLoggerExt methods and related types

`ITelemetryLoggerExt` is only for internal Fluid Framework use. The following deprecations help formalize that. See [issue #26910](https://github.com/microsoft/FluidFramework/issues/26910) for details.

| API | Kind | Package Export |
|-----|------|----------------|
| `TelemetryEventCategory` | Type alias | `@legacy` `@beta` |
| `ITelemetryGenericEventExt` | Interface | `@legacy` `@beta` |
| `ITelemetryErrorEventExt` | Interface | `@legacy` `@beta` |
| `ITelemetryPerformanceEventExt` | Interface | `@legacy` `@beta` |
| `ITelemetryLoggerExt.sendTelemetryEvent()` | Method | `@legacy` `@beta` |
| `ITelemetryLoggerExt.sendErrorEvent()` | Method | `@legacy` `@beta` |
| `ITelemetryLoggerExt.sendPerformanceEvent()` | Method | `@legacy` `@beta` |
