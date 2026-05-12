---
"@fluidframework/container-loader": patch
"__section": other
---
Tighten snapshot refresh config flag gating

`SnapshotRefresher` now requires `Fluid.Container.enableOfflineSnapshotRefresh` to be explicitly set to `true` for snapshot refresh to be enabled. Previously it fell back to `Fluid.Container.enableOfflineFull` when `enableOfflineSnapshotRefresh` was unset.
