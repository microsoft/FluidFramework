---
"@fluidframework/core-interfaces": minor
---

Removed ITelemetryProperties, TelemetryEventCategory, TelemetryEventPropertyType, and ITaggedTelemetryPropertyType

The `ITelemetryProperties` interface was deprecated and has been removed.
Use the identical `ITelemetryBaseProperties` instead.

The `TelemetryEventCategory` type was deprecated and has been removed from `@fluidframework/core-interfaces`, since
it had moved to `@fluidframework/telemetry-utils` in the past.

The `TelemetryEventPropertyType` type alias was deprecated and has been removed.
Use the identical `TelemetryBaseEventPropertyType` instead.

The `ITaggedTelemetryPropertyType` interface was deprecated and has been removed.
Use `Tagged<TelemetryBaseEventPropertyType>` instead.
