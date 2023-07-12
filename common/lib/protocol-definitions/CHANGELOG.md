# @fluidframework/protocol-definitions Changelog

## [2.0.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v2.0.0)

### Remove RemoteHelp from MessageType

This was deprecated in 1.2.0 and is now removed.

### Remove IHelpMessage and IQueueMessage

These are unused and have been removed.

### IQuorumClients and IQuorumProposals members disposed and dispose() removed

Directly calling dispose() on the IQuorumClients and IQuorumProposals puts the system in an inconsistent state, and inspecting the disposed state of the IQuorumClients and IQuorumProposals is not recommended (instead, prefer to inspect either the IContainer.disposed, IContainerRuntime.disposed, or IFluidDataStoreRuntime.disposed depending on your scenario). These members have been removed.

## [1.2.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v1.2.0) (2023-04-05)

### Deprecate term member from IDocumentAttributes and ISequencedDocumentMessage

This member was related to an experimental feature that did not ship. As a result it is unused/ignored by all consumers.
This change deprecates it, to be removed in a later release.

### Deprecate RemoteHelp from MessageType

The RemoteHelp MessageType is no longer used by the server side so it is safe to deprecate this op type.
This change deprecates it, to be removed in a later release.
