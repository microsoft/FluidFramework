---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
---

These properties `gcThrowOnTombstoneUsage` and `gcTombstoneEnforcementAllowed` have been deprecated in `IFluidParentContext` and `ContainerRuntime`. These were included in certain garbage collection telemetry to identify whether the corresponding features have been enabled. These features are now enabled by default and this information is added to the "GarbageCollectorLoaded" telemetry.

Also, the following Garbage collection runtime options and configs have been removed. They were added during GC feature development to roll out and control functionalities. The functionalities corresponding are on by default and can no longer be controlled:

GC runtime options removed:
- `gcDisableThrowOnTombstoneLoad`
- `disableDataStoreSweep`

GC configs removed:
- `"Fluid.GarbageCollection.DisableTombstone"`
- `"Fluid.GarbageCollection.ThrowOnTombstoneUsage"`
- `"Fluid.GarbageCollection.DisableDataStoreSweep"`
