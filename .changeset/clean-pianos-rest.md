---
"@fluidframework/odsp-driver": minor
"__section": deprecation
---
Deprecate the boolean EpochTracker.setEpoch overload

`EpochTracker.setEpoch(epoch, fromCache, fetchType)` is deprecated in favor of the overload that accepts a single source value, preventing contradictory telemetry dimensions.

The deprecated overload is scheduled for removal in version 3.20.0. See [AB#83307](https://dev.azure.com/fluidframework/internal/_workitems/edit/83307) for removal details.
