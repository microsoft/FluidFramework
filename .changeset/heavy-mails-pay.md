---
"@fluidframework/datastore-definitions": minor
"@fluidframework/test-runtime-utils": minor
"__section": breaking
---
getSnapshotTree is now required in IChannelStorageService

The `getSnapshotTree` property was added as optional to `IChannelStorageService` in version 2.51.0. It is now a required property.
See this [github issue](https://github.com/microsoft/FluidFramework/issues/25178) for more details.
