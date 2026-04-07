---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": patch
---

`LogLevel.default` and `LogLevel.error` are deprecated with removal tracked in [issue #26969](https://github.com/microsoft/FluidFramework/issues/26969).

Use `LogLevel.info` in place of `LogLevel.default`, and `LogLevel.essential` in place of `LogLevel.error`.

Internal usages of the deprecated values have been updated across `telemetry-utils`, `container-runtime`, `aqueduct`, `container-loader`, and `app-insights-logger`. Call sites now pass explicit log levels to `send()`, `sendTelemetryEvent()`, and `sendPerformanceEvent()`.
