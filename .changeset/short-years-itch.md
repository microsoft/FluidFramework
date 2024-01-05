---
"@fluidframework/datastore-definitions": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
---

garbage collection: Deprecate addedGCOutboundReference

The `addedGCOutboundReference` property on IDeltaConnection, IFluidDataStoreContext, and MockFluidDataStoreRuntime is
now deprecated.

The responsibility of adding outbound references (for Garbage Collection tracking) is moving up to the ContainerRuntime.
Previously, DDSes themselves were responsible to detect and report added outbound references (via a handle being stored),
so these interfaces (and corresponding mock) needed to plumb that information up to the ContainerRuntime layer where GC sits.
This is no longer necessary so they're being removed in an upcoming release.
