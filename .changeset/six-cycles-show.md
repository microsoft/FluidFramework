---
"@fluidframework/test-utils": major
---

EventAndErrorTrackingLogger is no longer a TelemetryLogger

TelemetryLogger was deprecated and has now been removed, so EventAndErrorTrackingLogger can no longer inherit from it. EventAndErrorTrackingLogger is now a ITelemetryBaseLogger, to get an ITelemetryLogger, or ITelemetryLoggerExt call createChildLogger and pass in the EventAndErrorTrackingLogger as the logger property.
