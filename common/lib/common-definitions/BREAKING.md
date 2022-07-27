## 0.21 Breaking changes

-   [ITelemetryBaseLogger.supportsTags deleted](#ITelemetryBaseLogger.supportstags-deleted)

### ITelemetryBaseLogger.supportsTags deleted

Proper support for tagged events will be assumed going forward. Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.
