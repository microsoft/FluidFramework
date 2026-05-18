---
"@fluidframework/container-runtime": minor
"__section": other
---

Remove the `Fluid.ContainerRuntime.DisableBatchIdTracking` config kill-switch and gate batchId tracking on the Offline Load opt-in

The internal `Fluid.ContainerRuntime.DisableBatchIdTracking` config flag has been removed. It was previously used as a kill-switch to suppress batchId stamping and `DuplicateBatchDetector` activation when both `FlushMode.TurnBased` and grouped batching were enabled. The flag is no longer needed: batchId tracking is now enabled iff the Offline Load feature is opted into via `Fluid.Container.enableOfflineFull`, which is also the natural off-ramp if a regression is observed.

Containers that do not opt into Offline Load no longer run `DuplicateBatchDetector`. Forked-container duplicate detection now requires the Offline Load opt-in.
