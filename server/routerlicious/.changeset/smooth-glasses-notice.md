---
"@fluidframework/server-routerlicious-base": major
"__section": breaking
---

Deprecated bindCorrelationId middleware removed from Alfred and Riddler Express apps

If enableGlobalTelemetryContext is set to false, retrieving correlationId via deprecated getCorrelationId will no longer work.
