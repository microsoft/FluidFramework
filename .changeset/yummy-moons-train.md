---
"@fluidframework/azure-client": minor
"@fluidframework/core-interfaces": minor
"__section": breaking
---
ITelemetryBaseLogger.minLogLevel may be undefined

Typing for `ITelemetryBaseLogger.minLogLevel` is updated to reflect that in some implementations `minLogLevel` is present but evaluates to `undefined`.
When building with `excactOptionalPropertyTypes:false` as suggested in [compatibility requirements](https://github.com/microsoft/FluidFramework/blob/68732d93a6cc8be2df966b9bb40f58bdd9fad69b/packages/common/core-interfaces/README.md#supported-tools), there is no apparent type change.
If a type error is experienced, make sure to check for `undefined` or use `?? LogLevel.info` when reading.
