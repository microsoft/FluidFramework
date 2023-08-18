---
"@fluidframework/telemetry-utils": minor
---

Removed `TelemetryNullLogger` class is again exported from @fluidframework/telemetry-utils

The `TelemetryNullLogger` class has been brought back to ease the transition to `2.0.0-internal.6.x`
*but is still deprecated* and will be removed in `2.0.0-internal.7.0.0`.

For internal use within the FluidFramework codebase, use `createChildLogger()` with no arguments instead.
For external consumers we recommend writing a trivial implementation of `ITelemetryBaseLogger`
(from the `@fluidframework/core-interfaces` package) where the `send()` method does nothing and using that.
