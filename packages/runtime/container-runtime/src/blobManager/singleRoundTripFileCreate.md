# Single-round-trip creation of detached containers with blobs

> Status: experimental implementation in
> [PR #28054](https://github.com/microsoft/FluidFramework/pull/28054).
> The persisted format is permanently summary-backed; it does not graduate summary blobs into
> attachments.

## Current contract

With `ContainerRuntimeOptions.enableSingleRoundTripFileCreate: true`, a blob created while the
container is detached:

1. receives one stable BlobManager `localId`;
2. remains in BlobManager memory instead of being uploaded to `IDetachedBlobStorage`;
3. is written into the attach summary under the shared
   `.blobs/.embeddedDetachedBlobs` tree;
4. remains summary-backed for its lifetime.

The shared tree has one namespaced `groupId`
(`fluid-internal:embedded-detached-blobs`) and one entry per `localId`. Each entry is a binary
`SummaryType.Blob` containing the original bytes. The application handle and GC route remain
`/_blobs/<localId>`; the current snapshot blob ID is only a storage lookup detail. A driver may use
base64 as its wire representation when it also records the encoding metadata, but
`IDocumentStorageService.readBlob()` returns the original binary bytes.

The implementation is in:

- `BlobManager.createBlobDetached()`, `getBlob()`, `summarize()`, `summarizeFullTree()`, and
  `deleteSweepReadyNodes()` in `blobManager.ts`;
- `loadV1()` and `summarizeBlobManagerState()` in `blobManagerSnapSum.ts`;
- the `DocumentsSchemaController` construction in `containerRuntime.ts`.

## Scenario behavior

| Scenario | Current behavior |
|---|---|
| Detached `uploadBlob()` | Stores the bytes in `localBlobCache`; no detached-storage `createBlob()` occurs. |
| Attach | `runRetriableAttachProcess()` in `packages/loader/container-loader/src/attachment.ts` sees no outstanding detached blobs and sends the complete runtime summary to `createContainer`. The successful logical create has no per-blob upload or follow-up summary upload. |
| Detached serialize/rehydrate | Loader JSON serialization retains blobs that round-trip losslessly through UTF-8 in the legacy `snapshotBlobs` map and puts all other bytes in the generic base64 `snapshotBlobContents` map. Rehydrate combines both maps into binary `ISnapshot.blobContents`; `loadV1()` restores the permanent classification and BlobManager uses the original bytes. Legacy UTF-8-only states remain loadable. Blobs added after rehydrate use the same single-request mode. |
| Creating client after attach | Retains its local bytes, can read them, and can round-trip them through attached pending state. A direct summary built on this actor may contain those bytes. |
| Fresh attached load | Retains `localId -> currentSnapshotBlobId` and the summary-backed classification. A loading-group-aware network snapshot may omit the payload, in which case `BlobManager.getBlob()` reads and returns that one binary snapshot blob without caching it. If pending state is requested, the loader fetches omitted structural bytes below the root `.blobs` tree with at most 32 reads in flight so the summary-backed payload survives offline rehydrate without fetching unrelated loading groups. A self-contained ODSP create-cache snapshot already contains the payload under a synthetic lookup ID; see "Snapshot acquisition behavior." |
| Ordinary clean summary | Emits `SummaryType.Handle` to `/.blobs/.embeddedDetachedBlobs/<localId>` and uploads no unchanged image bytes. |
| Snapshot unexpectedly omits the grouped subtree | The runtime currently has no out-of-group manifest of expected embedded local IDs. If a service omitted the subtree and IDs rather than only its payload contents, a fresh summarizer could treat the set as empty and silently omit it from the next summary. The service contract is expected to preserve the tree, but this needs an ODSP network test plus runtime defense in depth. A feature-enabled document with zero blobs is valid, so subtree absence alone cannot be treated as corruption. |
| Full-tree summary | Prior-summary handles are forbidden, so `loadFullTreeContents()` reads and re-emits every surviving payload as raw binary with at most 32 reads in flight. |
| Full-state/frozen capture | `readReferencedSnapshotBlobs()` in `packages/loader/container-loader/src/captureReferencedContents.ts` captures structural blobs in child trees below the reserved root `.blobs`; `snapshotHasLoadingGroups()` exempts only the group ID on `.blobs/.embeddedDetachedBlobs` and rejects any other group at or below `.blobs`. Snapshot-resident unreferenced-but-unswept content is retained because saved ops may revive it. The JSON artifact partitions structural bytes between lossless UTF-8 `snapshotBlobs` and base64 `snapshotBlobContents`. Attachment capture remains a separate base64 `attachmentBlobContents` map because it has a distinct responsibility and key space. All maps decode into binary before runtime reads. |
| GC and sweep | `getGCData()` reports `/_blobs/<localId>`. `deleteSweepReadyNodes()` removes the classification, creator cache entry, redirect mapping, and later summary entry in both creator and loaded states. |

## Summary mechanism versus summary actor

The format and the actor producing a summary are separate concerns.

`SummaryManager` creates a separate clean summarizer through `formCreateSummarizerFn()` in
`summary/summaryHelpers.ts`, with `interactive: false`, summarizer client type, and
`DriverHeader.summarizingClient: true`. That clean actor has no creator cache and emits stable
handles in ordinary storage-bound summaries. Therefore ordinary summaries do **not** repeatedly
store unchanged image bytes.

Materialization is intentional in these exceptional cases:

- the detached attach summary must contain the initial bytes;
- a direct summary from the still-live creator may use its retained bytes;
- a full-tree summary must be self-contained and re-emits binary content;
- `captureFullContainerState()` must include the persisted content for an offline frozen load.

Only the first and the ordinary clean-summarizer path describe normal creation and recurring
storage summaries respectively.

## Schema and compatibility

`enableSingleRoundTripFileCreate` is a persisted document-schema feature and requires
`explicitSchemaControl`.

- `containerRuntime.ts` requests the feature only while detached. A persisted detached selection is
  sticky across detached rehydrate even if the host omits the option.
- A globally enabled option does not request the feature property for an unrelated attached
  existing document. The host's explicitly supplied compatibility floor can still advance
  `info.minVersionForCollab` through normal schema logic. Existing documents that already contain
  the property are still parsed and preserved.
- `checkRuntimeCompatibility()` in `summary/documentSchema.ts` rejects unknown runtime schema
  properties, so older runtimes fail instead of silently dropping the subtree.
- `runtimeOptionsAffectingDocSchemaConfigValidationMap` in `containerCompatibility.ts` gates
  `true` to `oldestSupportedClient: "3.0.0"`, the first release line containing this reader.
- The runtime requires the loader's generic `binarySnapshotBlobSerialization` layer capability
  whenever the persisted feature is active. Under normal compatibility enforcement this rejects a
  mixed-version client before an older UTF-8-only loader can serialize raw snapshot bytes. The
  feature requirement is appended to baseline Loader requirements. Generic compatibility-bypass
  settings can suppress this protection and turn version skew into binary corruption, so they need
  an explicit rollout contract.

The option is marked `@beta` on the legacy `ContainerRuntimeOptions` interface. Its release requires
the normal API Council review for a new beta API.

`lookupTemporaryBlobStorageId()` intentionally returns `undefined` permanently for these blobs:
summary blob IDs are storage lookup details, not attachment IDs or temporary attachment URLs.

New detached and pending-state artifacts use the optional `snapshotBlobContents` field only for
bytes that cannot be represented losslessly in the legacy UTF-8 `snapshotBlobs` map. The loader
continues to read older artifacts, and older loaders can still reconstruct new states containing
only lossless UTF-8 blobs. A state containing arbitrary binary structural blobs requires a loader
that understands `snapshotBlobContents`; binary is omitted from the legacy map rather than
corrupted. This serialized-state compatibility boundary must be included in rollout planning; it is
separate from document collaboration compatibility.

## Verified coverage

`packages/test/local-server-tests/src/test/detachedBlobSingleRequestCreate.spec.ts` verifies:

- one `createContainer`, zero `createBlob`, and zero `uploadSummaryWithContext` calls;
- binary detached serialize/rehydrate, including a new blob added after rehydrate;
- attached creator pending-state reload;
- `captureFullContainerState()` followed by an offline frozen read;
- a clean ordinary summary containing handles only;
- a future full-tree summary containing raw binary blobs;
- reload and binary read after both summary generations.

`src/test/blobs/blobManager.spec.ts` separately verifies lazy uncached reads, full-tree concurrency
32, no snapshot-ID exposure as an attachment ID, mixed legacy/summary-backed state, and sweep in
creator and attached loaded state. Schema boundary and detached-only request behavior are covered
in `src/test/containerRuntime.spec.ts` and `src/test/documentSchema.spec.ts`.

There is still no old/new package-pair test, real ODSP grouped-network-snapshot test, portable
feature E2E, randomized stress test, or service-load matrix.

## Snapshot acquisition behavior

Ordinary summaries avoid reuploading unchanged payloads, but later load efficiency depends on how
the driver acquires a snapshot.

The loader uses the loading-group-aware `getSnapshot()` path only when
`Fluid.Container.UseLoadingGroupIdForSnapshotFetch2` is `true` and the storage policy advertises
`supportGetSnapshotApi`. The fallback snapshot-tree path does not provide an equivalent code-level
payload-exclusion guarantee.

ODSP's create cache intentionally uses a self-contained representation.
`convertCreateNewSummaryTreeToTreeAndBlobs()` recursively assigns synthetic UUIDs to all summary
blobs and puts every payload in `ISnapshot.blobContents`; `createFile()` stores that complete
snapshot in the create cache. A later cache-backed load therefore receives all embedded payloads,
but this is correct: the synthetic IDs are cache-local lookup details and their bytes are present.
They are never exposed as attachment IDs. The bytes could not be removed without also replacing the
synthetic IDs with service-resolvable IDs or another lazy-read mapping.

The open requirement is to verify that the ODSP network path returns the grouped structure and
service IDs without payload contents. Whether cache-backed loads must also be payload-lazy is a
separate product decision, not a correctness issue.

## Remaining work

### P1

1. **ODSP network validation.** Verify that loading-group-aware network snapshots retain the tree
   and service blob IDs while omitting payload contents. Add an out-of-group manifest or equivalent
   validation so unexpected tree omission cannot silently delete the feature's only index. Do not
   reject subtree absence by itself because a document with zero embedded blobs is valid.
2. **Create-cache contract.** Decide whether a self-contained eager cache-backed load is acceptable.
   If cache-backed loads must also be payload-lazy, redesign the cache to use service-resolvable IDs
   or another lazy-read mapping.
3. **Acquisition telemetry.** Record cache/network source, snapshot API, returned grouped payload
   count/bytes, and fallback mode.
4. **Portable multi-generation validation.** The local-server chain now covers
   `create -> clean ordinary summary -> reload -> future full-tree summary -> reload`. Add a
   portable E2E equivalent and adopt detached stress/service-load coverage.
5. **Detached rehydrate without configuration.** Directly test that a persisted detached selection
   remains active when the rehydrating host omits the option and creates another blob.
6. **Pending-state cost.** Fresh attached pending state is self-contained and materializes every
   summary-backed payload with bounded concurrency. Define limits or an explicit reference-only
   alternative.
7. **API stability and reachability.** Resolve the public beta versus experimental/not-ready
   staging mismatch. If public, ensure common factories expose the required
   `oldestSupportedClient`; otherwise keep the option internal or alpha.
8. **Compatibility enforcement.** Add real version-pair tests and decide whether generic
   layer-compatibility bypasses are unsupported or must not bypass this binary requirement.
9. **Serialized-state rollout.** Decide and document whether pending/detached state is expected to
   move only forward to newer loaders, or add an explicit version/failure contract for loaders that
   predate `snapshotBlobContents`.
10. **Recovery workflows.** Add feature-specific `AttachState.Attaching`, create failure/retry, and
   unreferenced-content revival coverage.
11. **API report tooling.** The unrelated `events_pkg` import is reproduced by successful API
   report generation in the available environment, and the non-local `ci:build:api-reports`
   validation passes. The same toolchain also adds it when regenerating the merge-base reports, so
   it is not caused by this feature. Keep generated output intact and investigate the
   extractor/toolchain separately rather than hand-editing reports.

### P2

1. Define blob-count, binary summary size, JSON pending-state encoded size, and request-size limits;
   provide an early fallback or actionable failure; add telemetry for create size, retries, lazy
   reads, and full-tree/full-state materialization.
2. Validate retry, idempotency, and atomic-request behavior for ambiguous or throttled create
   failures.
3. Other services may preserve correctness by returning the complete grouped snapshot, but payload
   exclusion is not yet established outside ODSP.
4. Ensure the `ISnapshot` structural-capture fast path excludes direct root `.blobs` attachment
   contents if a driver supplies them in `blobContents`.

## Historical rationale

An earlier #28054 design reinterpreted snapshot summary blob IDs as attachment IDs after load. That
graduation was rejected because detached rehydrate and ODSP create-cache snapshots can contain
client-synthetic IDs. The loader now preserves arbitrary structural bytes generically by using
base64 only in JSON serialized-state artifacts and decoding back into binary `ISnapshot` contents.
Permanent summary backing, raw binary storage, stable path handles, and explicit self-contained
materialization remove those correctness dependencies. See
[comparisonWithPr27880.md](./comparisonWithPr27880.md).
