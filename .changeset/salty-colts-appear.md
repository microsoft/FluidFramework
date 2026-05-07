---
"@fluidframework/core-interfaces": minor
"__section": deprecation
---

Deprecated LogLevel.default and LogLevel.error

`LogLevel.default` and `LogLevel.error` in `@fluidframework/core-interfaces` are deprecated in favor of the semantically clearer `LogLevel.info` and `LogLevel.essential`.

#### Migration

The recommended replacement depends on how the value is used:

- For an **event's `logLevel`** (e.g. the `logLevel` argument to `sendTelemetryEvent` / `sendPerformanceEvent` / `ITelemetryBaseLogger.send`), the recommendation is `LogLevel.essential`.
- For a logger's **`minLogLevel`** (the threshold that filters events), `LogLevel.info` is the recommendation.

See [issue #26969](https://github.com/microsoft/FluidFramework/issues/26969) for full guidance and removal tracking (planned for v3.0).
