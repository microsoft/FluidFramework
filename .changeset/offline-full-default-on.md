---
"@fluidframework/container-runtime": minor
"@fluidframework/container-loader": minor
"__section": other
---

Consolidate offline feature flags into a single `disableOfflineFull` kill-switch

All offline capabilities (batch-ID tracking, duplicate-batch detection, offline load, snapshot refresh) are now **on by default**. The previous opt-in flags `Fluid.Container.enableOfflineFull`, `Fluid.Container.enableOfflineLoad`, and `Fluid.ContainerRuntime.DisableBatchIdTracking` have been removed.

To disable all offline features, set the config flag `Fluid.Container.disableOfflineFull` to `true`. A finer-grained sub-switch `Fluid.Container.disableOfflineSnapshotRefresh` can independently disable just the snapshot-refresh path while leaving the rest of offline load enabled — retained as a stability mitigation for server-side ordering regressions.

Runtime-level offline features (batch-ID tracking, duplicate-batch detection) silently degrade instead of throwing a `UsageError` when prerequisites (TurnBased flush mode + grouped batching) are not met. When this happens, a one-shot `OfflineBatchIdTrackingDegraded` telemetry event is emitted naming the missing prerequisite.
