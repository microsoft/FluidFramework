## Breaking changes to expect in upcoming releases

- [ITelemetryBaseLogger.supportsTags to be deleted](#ITelemetryBaseLogger.supportstags-to-be-deleted)

### ITelemetryBaseLogger.supportsTags to be deleted
Proper support for tagged events will be assumed going forward.  Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.

This property will be __deprecated__ in 0.20.2, and will be __deleted__ in the 0.21 release
