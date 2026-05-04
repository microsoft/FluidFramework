---
"@fluidframework/telemetry-utils": minor
"__section": other
---

ChildLogger now tags events with no explicit `logLevel` as `essential`

`@fluidframework/telemetry-utils` previously forwarded events with no explicit `logLevel` to the base logger as `undefined` (treated as `LogLevel.info` = `20`). It now forwards them as `LogLevel.essential` (= `30`). Specifically:

- `ChildLogger.shouldFilterOutEvent` now falls back to `LogLevel.essential` when an event has no `logLevel` (previously fell back to `LogLevel.default` = `LogLevel.info` = `20`).
- `ChildLogger.send` now forwards `LogLevel.essential` to the base logger when no `logLevel` is supplied, instead of forwarding `undefined`.
- The implicit `= LogLevel.default` parameter defaults on `TelemetryLogger.sendTelemetryEvent` and `sendPerformanceEvent` were removed; callers that omit `logLevel` now propagate `undefined` through the chain, where `ChildLogger` applies the new `essential` fallback above.

#### Impact for downstream consumers

Internal Fluid events that previously arrived at the base logger with `logLevel = undefined` will now arrive tagged as `30` (`essential`). Hosts that filter telemetry by numeric level should not start dropping `logLevel = 20` events as "non-essential" unless **all** running Fluid versions include this change. Older versions still send those same critical events at level `20`, and dropping them would lose telemetry.

#### Events already explicitly tagged as `LogLevel.info`

Note that this change only affects events emitted with **no** explicit `logLevel`. A set of events that are already explicitly tagged with `LogLevel.info` (= `20`) was introduced in [PR #27126](https://github.com/microsoft/FluidFramework/pull/27126) and is unaffected by this change. Those events continue to be emitted at level `20` by design and are the intended target for hosts that want to drop non-essential telemetry once all running Fluid versions include both PR #27126 and this change.
