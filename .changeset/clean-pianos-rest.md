---
"@fluidframework/odsp-driver": minor
"__section": deprecation
---
Deprecate the boolean EpochTracker.setEpoch overload

`EpochTracker.setEpoch(epoch, fromCache, fetchType)` is deprecated. Consumers should migrate to `EpochTracker.setEpoch(epoch, source)`, which accepts a single source value and prevents contradictory telemetry dimensions.

The deprecated overload is scheduled for removal in version 3.20.0.
