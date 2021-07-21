## Upcoming Breaking changes being staged in this release

- [ITelemetryBaseLogger.supportsTags to be deleted](#ITelemetryBaseLogger.supportstags-to-be-deleted)

### ITelemetryBaseLogger.supportsTags to be deleted
Proper support for tagged events will be assumed going forward.  Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.

This property has be __deprecated__ in 0.20.1, and will be __deleted__ in the 0.21 release
