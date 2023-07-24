---
"@fluidframework/telemetry-utils": major
---

Remove Deprecated Loggers

This change removes the previously deprecated logger implementations. The following replacements are available:

-   replace ChildLogger.create, new TelemetryNullLogger, and new BaseTelemetryNullLogger with createChildLogger
-   replace new MultiSinkLogger with createMultiSinkLogger
-   replace TelemetryUTLogger with MockLogger
-   DebugLogger has no intended replacement
