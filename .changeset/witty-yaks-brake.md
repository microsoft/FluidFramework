---
"@fluidframework/protocol-definitions": minor
---

IQuorumClients and IQuorumProposals members disposed and dispose() deprecated

Directly calling dispose() on the IQuorumClients and IQuorumProposals puts the system in an inconsistent state, and inspecting the disposed state of the IQuorumClients and IQuorumProposals is not recommended (instead, prefer to inspect either the IContainer.disposed, IContainerRuntime.disposed, or IFluidDataStoreRuntime.disposed depending on your scenario).  These members have been deprecated from the interface and will be removed in an upcoming release.
