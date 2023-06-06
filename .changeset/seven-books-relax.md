---
"@fluidframework/datastore": major
"@fluidframework/test-utils": major
---

FluidDataStoreRuntime.getChannel throws for channels that do not exist

Previously, calling `FluidDataStoreRuntime.getChannel(id)` for a channel that does not exist would wait for the channel to be created (possibly waiting indefinitely if never created). However, there is no safe means to dynamically create a channel in this manner without risking data corruption. The call will instead now throw for non-existent channels.

TestFluidObject.load removed

TestFluidObject.load performed unsafe initialization, and has instead been replaced by direct usage of the constructor plus a call to testFluidObject.initialize(). This should have no impact to your scenario, as instantiation of TestFluidObjects should only be done through TestFluidObjectFactory.
