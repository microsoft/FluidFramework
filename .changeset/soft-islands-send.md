---
"@fluidframework/container-definitions": minor
---

IDeltaManager members disposed and dispose() deprecated

Directly calling dispose() on the IDeltaManager puts the system in an inconsistent state, and inspecting the disposed state of the IDeltaManager is not recommended (instead, prefer to inspect either the IContainer.disposed, IContainerRuntime.disposed, or IFluidDataStoreRuntime.disposed depending on your scenario).  These members have been deprecated from the interface and will be removed in an upcoming release.
