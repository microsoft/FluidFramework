---
"@fluidframework/datastore-definitions": minor
"__section": legacy
---
New "getSnapshotTree" API on "IChannelStorageService"

A new optional API, `getSnapshotTree` has been added to `IChannelStorageService`. It should return the snapshot tree for a channel. The snapshot tree can be used by a channel to examine its snapshot.
