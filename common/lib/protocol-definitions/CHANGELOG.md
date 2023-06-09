# @fluidframework/protocol-definitions Changelog

## [2.0.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v2.0.0) (2023-05-09)

### Remove RemoteHelp from MessageType

This was deprecated in 1.2.0 and is now removed.

### Remove IHelpMessage and IQueueMessage

These are unused and have been removed.

## [1.2.0](https://github.com/microsoft/FluidFramework/releases/tag/protocol-definitions_v1.2.0) (2023-04-05)

### Deprecate term member from IDocumentAttributes and ISequencedDocumentMessage

This member was related to an experimental feature that did not ship. As a result it is unused/ignored by all consumers.
This change deprecates it, to be removed in a later release.

### Deprecate RemoteHelp from MessageType

The RemoteHelp MessageType is no longer used by the server side so it is safe to deprecate this op type.
This change deprecates it, to be removed in a later release.
