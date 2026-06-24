---
"@fluidframework/azure-client": minor
"@fluidframework/core-interfaces": minor
"__section": deprecation
---
Calling ITelemetryBaseLogger.send without defined logLevel is deprecated

All callers to `ITelemetryBaseLogger.send` should specify an explicit `LogLevel` for `logLevel` parameter.
See [issue #27595](https://github.com/microsoft/FluidFramework/issues/27595) for further details.
