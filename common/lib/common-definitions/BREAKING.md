## 0.21 Breaking changes

-   [ITelemetryBaseLogger.supportsTags deleted](#ITelemetryBaseLogger.supportstags-deleted)

### ITelemetryBaseLogger.supportsTags deleted

Proper support for tagged events will be assumed going forward. Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.

### ITelemetryBaseProperties introduced & ITelemetryProperties changed

Separated the types used in our Telemetry system to use two different sets (ITelemetryBaseProperties & ITelemetryProperties). ITelemetryBaseProperties has the same properties as the previous ITelemetryProperties type, whereas the new ITelemetryProperties will now have support for flat arrays.

Any implementation of the ITelemetryBaseLogger is now required to use the ITelemetryBaseProperties (rather than ITelemetryProperties), as well as any other types comprising ITelemetryBaseEvent, TelemetryBaseEventPropertyType, etc.
