---
"@fluidframework/server-services-telemetry": major
"@fluidframework/server-services-utils": major
---

Default value for enableGlobalTelemetryContext config changed to true

Global TelemetryContext is replacing deprecated correlationId tracking. TelemetryContext is now defaulted to enabled, which will automatically output correlationId, tenantId, and documentId in service telemetry.
