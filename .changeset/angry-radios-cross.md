---
"@fluidframework/core-interfaces": major
---

Removed TelemetryEventCategory, TelemetryEventPropertyType, and ITaggedTelemetryPropertyType

The `TelemetryEventCategory` type has been removed from `@fluidframework/core-interfaces`, since it had moved to
`@fluidframework/telemetry-utils` in the past.

The `TelemetryEventPropertyType` type alias has been removed.
Use the equivalent `TelemetryBaseEventPropertyType` instead.

The `ITaggedTelemetryPropertyType` interface has been removed.
Use `Tagged<TelemetryBaseEventPropertyType>` instead.
