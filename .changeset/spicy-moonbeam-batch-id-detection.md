---
"@fluidframework/container-runtime": minor
"__section": feature
---
Duplicate batch detection now activates automatically with pending state

Duplicate batch detection in `ContainerRuntime` previously had to be opted in via `Fluid.ContainerRuntime.enableBatchIdTracking` or `Fluid.Container.enableOfflineFull` config. It now activates automatically whenever fork detection is in play in this session:

- The runtime is rehydrated from a captured pending state.
- The loaded snapshot already contains a `recentBatchInfo` blob.
- `getPendingLocalState()` is called.
- An inbound batch arrives carrying an explicit `batchId` in its metadata. This covers pure observers — clients that aren't a fork source themselves but need to track inbound batchIds in order to stay consistent with peers that will throw on the duplicate.

Once activated, detection (and `batchId` stamping on resubmits) is sticky for the runtime's lifetime.

The previous opt-in flags are no longer read by `ContainerRuntime`. The loader-layer reads of `Fluid.Container.enableOfflineFull` (gating `SerializedStateManager` and snapshot refresh) are unchanged.

The constructor-time check that disallowed Offline Load with non-`TurnBased` flush mode has moved to `getPendingLocalState()`, where it now throws `UsageError("getPendingLocalState requires FlushMode.TurnBased")` at the moment of capture. Constructing a runtime in `FlushMode.Immediate` no longer throws even when pending state is provided.

A short-lived kill switch, `Fluid.ContainerRuntime.DisableDuplicateBatchDetection`, is added so the new auto-activation can be disabled via configuration if it causes regressions. The kill switch is intended to be removed in a future release.
