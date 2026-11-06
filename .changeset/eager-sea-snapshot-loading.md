---
"@fluidframework/sea-driver": minor
"@fluidframework/sea-tree": minor
"__section": tree
---

Bulk load direct SharedTree snapshots before kernel initialization

The direct Sea host discovers the snapshot manifest and bulk-fetches its unique blobs before handing storage to SharedTree.
Load-owned results remain available even when the driver's content cache is disabled or too small.
Clients without bulk-read support retain individual reads.

Sea content requests now accept up to 4,096 explicit roots instead of 256.
Response bytes, returned items, and descendant traversal remain bounded independently.
The driver retries roots omitted by partial responses without requesting already received roots again.
Deploy the updated service before using the larger client requests.

The direct editor now requests up to 4,096 descendant directories during opening, then fetches the snapshot blobs in bulk.
