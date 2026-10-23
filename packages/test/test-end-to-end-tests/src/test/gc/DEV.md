# What do the garbage collection end-to-end tests cover?

These specs check garbage collection (GC) across changes to references, summaries, and service storage.

## `gcAttachmentBlobs.spec.ts`

Checks reference tracking and deletion of attachment blobs uploaded before attachment, after attachment, or during a disconnection, including deduplicated uploads.

## `gcContainerRuntimeCompat.spec.ts`

Checks that a container runtime can read unreferenced timestamps from summaries written by another runtime version.

## `gcDataVirtualization.spec.ts`

Checks that virtualized data stores retain their GC state when their snapshots are not downloaded.

## `gcDatastoreAliased.spec.ts`

Checks that assigning an alias keeps a data store referenced even when no handle to it remains in a shared object.

## `gcDatastoreDuplicateRoutes.spec.ts`

Checks that changes to shared objects do not introduce duplicate routes into a data store's GC state.

## `gcDeleteObjectsInTestMode.spec.ts`

Checks how test-mode GC marks data stores and attachment blobs as referenced or unreferenced and deletes unreferenced content.

## `gcInactiveNodes.spec.ts`

Checks inactive-node telemetry and how reviving inactive data stores or attachment blobs changes their state.

## `gcIncrementalSummaries.spec.ts`

Checks that incremental summaries reuse handles for unchanged data stores, rewrite stores whose content or reference state changed, and recover from failed uploads.

## `gcReferenceUpdatesInSummary.spec.ts`

Checks that handle changes in shared objects, including undo and redo, update data-store reference state in the next summary.

## `gcStats.spec.ts`

Checks GC statistics as nodes become unreferenced, sweep-ready, deleted, or referenced again.

## `gcSummaryLateAck.spec.ts`

Checks that retiring a timed-out summary prevents its late acknowledgment from adopting GC data from a failed upload.

### Why does the test hold the service acknowledgment?

The local-service test intercepts the raw-deltas producer for its document and holds A's real service-generated acknowledgment before the orderer sequences it.
This lets a reference-change operation move GC data from G1 to G2 while A waits for its acknowledgment.
After A times out, B generates G2 but fails during upload.
The test restores the producer method in `finally` so that the gate does not affect later tests.

### What happens when A's acknowledgment arrives?

A is no longer tracked by the old summarizer.
The real acknowledgment uses the untracked path, fetches A's accepted snapshot, and closes that stale summarizer when the snapshot exists.
An older fetched snapshot remains an exception to closing, as covered by the container-runtime unit tests.

### How does the next summary preserve G2?

A new summarizer loads the accepted snapshot and processes the later reference change before it creates C.
The test checks that C contains G2 as a GC tree rather than a stale `/gc` handle, then reads C's persisted GC blob from service storage.
It compares the GC reference graph rather than unreferenced timestamps because the new summarizer can mark a node unreferenced at a later time.

### What remains open?

Direct or untracked summary generation and general GC auto-recovery generation tracking are separate follow-ups.

## `gcSweepAttachmentBlobs.spec.ts`

Checks that sweeping attachment blobs prevents their use and removes them from summaries, including across deduplication and failed summaries.

## `gcSweepDataStores.spec.ts`

Checks that sweeping data stores prevents access to deleted stores and records their deletion in summaries, including retry and trailing-operation cases.

## `gcSweepUnreferencePhases.spec.ts`

Checks that unreferenced objects move through the unreferenced, tombstoned, and deleted phases in order.

## `gcTombstoneAttachmentBlobs.spec.ts`

Checks access to tombstoned attachment blobs in attached, detached, and disconnected containers, including when uploads are deduplicated.

## `gcTombstoneDataStores.spec.ts`

Checks restrictions on loading or changing tombstoned data stores and how summaries record their tombstone state.

## `gcTrailingOps.spec.ts`

Checks that reference changes sequenced after a summary are applied before later GC runs and do not cause live data stores to be deleted.

## `gcTreeSummaryHandles.spec.ts`

Checks when a GC summary can reuse a tree handle and when reference changes or failed uploads require new GC data.

## `gcUnknownHandles.spec.ts`

Checks that handles to unknown object paths do not create unexpected GC nodes or fail collection.

## `gcUnreferencedFlagInSnapshot.spec.ts`

Checks that a data store's unreferenced flag remains correct when an uploaded summary is downloaded as a snapshot.

## `gcUnreferencedTimestamp.spec.ts`

Checks how summaries add, preserve, or remove unreferenced timestamps when references to data stores and attachment blobs change.

## `gcVersionUpdate.spec.ts`

Checks how loading a summary written with a different GC version resets GC state or disables GC.
