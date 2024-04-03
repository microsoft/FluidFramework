---
"@fluidframework/runtime-definitions": major
---

IFluidDataStoreContext no longer raises events, IFluidDataStoreChannel needs to implement new method

This change could be ignored, unless you have custom implementations of IFluidDataStoreChannel or listened to IFluidDataStoreContext's "attached" or "attaching" events

IFluidDataStoreContext no longer raises events. Instead, it will call IFluidDataStoreChannel.setAttachState().
If you are implementing data store runtme, please implement setAttachState() API and rely on this flow.
If you are not data store developer, and were reaching out to context, then please stop doing it - the only purpose of IFluidDataStoreContext is
communication with IFluidDataStoreChannel. Context object should not be exposed by impplementers of IFluidDataStoreChannel.
If you are using stock implementations of IFluidDataStoreChannel, you can listen for same events on IFluidDataStoreRuntime instead.
