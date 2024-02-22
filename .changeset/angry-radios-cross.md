---
"@fluidframework/core-interfaces": major
---

Removed TelemetryEventCategory and TelemetryEventPropertyType

The `TelemetryEventCategory` type has been removed from `@fluidframework/core-interfaces`, since it had moved to
`@fluidframework/telemetry-utils` in the past.

The `TelemetryEventPropertyType` type alias has been removed.
Use the equivalent `TelemetryBaseEventPropertyType` instead.
