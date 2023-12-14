# @fluidframework/protocol-definitions Changelog

## [3.1.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v3.1.0)

### Deprecated properties on ISequencedDocumentMessage

`ISequencedDocumentMessage` properties `compression` and `expHash1` are deprecated. They have been extracted into a
separate interface `ISequencedDocumentMessageExperimental` and should be used from there instead.

### Package now works properly with TypeScript's node16 moduleResolution

The package now has an "exports" field in its package.json so node16 moduleResolution will work
for both CJS and ESM.

## [3.0.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v3.0.0)

### Updated @fluidframework/common-definitions

The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

## [2.1.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v2.1.0)

### Updated signal interfaces

Updating signal interfaces for some planned improvements. The intention is split the interface between signals submitted by clients to the server and the resulting signals sent from the server to clients.

A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has been added, which will be the typing for signals sent from the client to the server. Both extend a new ISignalMessageBase interface that contains common members.

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
