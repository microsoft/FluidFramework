---
"@fluidframework/server-services-telemetry": major
"@fluidframework/server-services-utils": major
---

Adds a new property to track the source of the correlationId

A new property - correlationIdSource - is added to track the source of the correlationId. This source can be either the client or server based on where the correlationId was generated.
