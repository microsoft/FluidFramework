## 0.21 Breaking changes

- [ITelemetryBaseLogger.supportsTags deprecated](#ITelemetryBaseLogger.supportstags-deprecated)

### ITelemetryBaseLogger.supportsTags deprecated
We are deprecating use of supportsTags and instead going to handle tags directly at the loader/runtime boundary
via `IContainerContext`. Other than this boundary, all loggers can assume full support for tags on all telemetry events.
This will involve a change in `container-definitions`, which is packaged as part of the `build-common` release.
