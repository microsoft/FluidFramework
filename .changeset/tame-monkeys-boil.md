---
"@fluidframework/datastore-definitions": minor
"__section": legacy
---
New "getSnapshotTree" API on "IChannelStorageService"

A new optional API, `getSnapshotTree` has been added to `IChannelStorageService`. It should return the snapshot tree for a channel. This will help channels examine their snapshot when it consists of dynamic trees and blobs, i.e., the number of tree and blobs and / or their keys are not known in advance.
