---
"fluid-framework": minor
"__section": other
---
Re-export telemetry types from `fluid-framework`

The `fluid-framework` package now re-exports the following telemetry types from `@fluidframework/core-interfaces`:

- `ITelemetryBaseEvent`
- `ITelemetryBaseLogger`
- `LogLevel`
- `LogLevelConst`

Consumers can now import these types directly from `fluid-framework` without needing a separate dependency on `@fluidframework/core-interfaces`.
