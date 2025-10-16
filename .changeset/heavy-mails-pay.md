---
"@fluidframework/datastore-definitions": minor
"@fluidframework/test-runtime-utils": minor
"__section": breaking
---
getSnapshotTree is now required in IChannelStorageService

The `getSnapshotTree` property was added as optional to `IChannelStorageService` in version [2.51.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.51.0#user-content-new-getsnapshottree-api-on-ichannelstorageservice-24970). It is now a required property.
