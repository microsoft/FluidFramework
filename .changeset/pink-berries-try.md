---
"@fluidframework/test-utils": major
---

MockLogger is no longer a TelemetryLogger

TelemetryLogger was deprecated and has now been removed, so MockLogger can no longer inherit from it. MockLogger is now a ITelemetryBaseLogger, to get an ITelemetryLogger, or ITelemetryLoggerExt there is a new convenience method, `MockLogger.toTelemetryLogger()
