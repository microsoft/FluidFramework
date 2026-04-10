---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": minor
"__section": deprecation
---
Deprecated default and error in LogLevel

Two new `LogLevel` members have been added to `@fluidframework/core-interfaces` to better express intent:

- `LogLevel.info` — replaces `LogLevel.default` (same numeric value). Use this for informational session logs that could be omitted at high telemetry volumes.
- `LogLevel.essential` — replaces `LogLevel.error` (same numeric value). Use this for critical operational events that should always be collected.

`LogLevel.default` and `LogLevel.error` are now `@deprecated` and will be removed in a future release (see [issue #26969](https://github.com/microsoft/FluidFramework/issues/26969) for the removal timeline).

If an event does not have a log level specified, it should be treated as if it were `LogLevel.essential`.

**Migration:**

| Deprecated | Replacement |
|---|---|
| `LogLevel.default` | `LogLevel.info` |
| `LogLevel.error` | `LogLevel.essential` |
