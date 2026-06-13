---
"@fluidframework/core-interfaces": minor
"__section": breaking
---
ITelemetryBaseLogger.minLogLevel may be undefined

Typing for `ITelemetryBaseLogger.minLogLevel` is updated to reflect that in some implementations `minLogLevel` is present but evaluates to `undefined`.
When building with `excactOptionalPropertyTypes:false` as specified in compatibility requirements, there is not apparent type change.
If a type error is experienced, make sure to check for `undefined` or use `?? LogLevel.info` when reading.
