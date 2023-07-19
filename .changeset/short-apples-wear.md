---
"@fluidframework/telemetry-utils": minor
---

Deprecate Internal TelemetryLogger Implementations

This change deprecates our internal TelemetryLogger implementations and unifies our exported and consumed surface area on our telemetry interfaces.

For the deprecated implementations the following replacement function should be used:

-   replace ChildLogger.create, new TelemetryNullLogger, new BaseTelemetryNullLogger, and new TelemetryUTLogger with createChildLogger
-   replace DebugLogger.create with createDebugLogger
-   replace new MultiSinkLogger with createMultiSinkLogger
