---
"@fluidframework/container-runtime": minor
"@fluidframework/container-loader": minor
"__section": other
---

Consolidate offline feature flags into a single `disableOfflineFull` kill-switch

All offline capabilities (batch-ID tracking, duplicate-batch detection, offline load, snapshot refresh) are now **on by default**. The previous opt-in flags `Fluid.Container.enableOfflineFull`, `Fluid.Container.enableOfflineLoad`, `Fluid.Container.enableOfflineSnapshotRefresh`, and `Fluid.ContainerRuntime.DisableBatchIdTracking` have been removed.

To disable all offline features, set the config flag `Fluid.Container.disableOfflineFull` to `true`. A finer-grained sub-switch `Fluid.Container.disableOfflineSnapshotRefresh` can independently disable just the snapshot-refresh path while leaving the rest of offline load enabled — retained as a belt-and-suspenders stability mitigation.

Runtime-level offline features (batch-ID tracking, duplicate-batch detection) silently degrade instead of throwing a `UsageError` when prerequisites (TurnBased flush mode + grouped batching) are not met. When this happens, a one-shot `OfflineBatchIdTrackingDegraded` telemetry event is emitted naming the missing prerequisite.

**Migration**

- Hosts setting `Fluid.ContainerRuntime.DisableBatchIdTracking=true` to disable batch-id tracking should set `Fluid.Container.disableOfflineFull=true` instead.
- Hosts setting `Fluid.Container.enableOfflineSnapshotRefresh=false` as a stability mitigation should set `Fluid.Container.disableOfflineSnapshotRefresh=true` instead.
- `Fluid.Container.enableOfflineLoad` and `Fluid.Container.enableOfflineFull` are removed from the read paths, but `=== false` on either key is still honored for one release as a deprecation alias to preserve defensive kill-switches partners may hold. New code should use `Fluid.Container.disableOfflineFull=true`.

**Risk**

Snapshot refresh default-on was previously gated behind a feature flag added in PR #20840 as a mitigation for AB#7810 ("Ranges finalized out of order" stress regression after PR #20427). AB#7810 is resolved (fix tracked in https://github.com/microsoft/FluidFramework/pull/26898). The `Fluid.Container.disableOfflineSnapshotRefresh` sub-switch is retained as a belt-and-suspenders emergency lever if the regression class re-emerges in production.
