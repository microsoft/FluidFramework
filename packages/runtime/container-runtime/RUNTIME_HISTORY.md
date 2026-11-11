# Runtime-controlled document history

**Status: design proposal, not implemented.**

## Goal and assumptions

Reconstruct the durable state of a container at a selected point in time without relying on DDS-specific history support.
Store the required checkpoints and ops inside the current file, under runtime control.
Do not depend on ODSP version history: it can be disabled, deleted, incomplete, or expensive to enumerate and load.

- Enable the feature only for new documents, after all participating clients and summarizers support it.
- Current runtime and distributed data structure (DDS) implementations must remain compatible with old summaries and ops.
  This requirement includes persisted SharedSummaryBlock data.
- The summarizer captures and preserves history on every successful summary.
- Retention is a policy-driven minimum, initially 30 days, not a physical-deletion deadline.
- Opening or refreshing the timeline requires a live container and service support for loading groups.
  Timeline discovery on frozen containers is not supported.
- Preserve every part of a checkpoint's load state, including unreferenced subtrees.
  Do not filter its contents using current reachability or garbage collection (GC) state.

Unsequenced local changes and signals are outside this design.
Historical containers are read-only; generic undo, editing from an old state, and application restore semantics are outside scope.

## Storage layout

Add a runtime-owned history subtree to the application summary, separate from current application state.
Use non-default loading groups to separate the small manifest and active segment from checkpoints and sealed segments.
This lets the summarizer extend history without downloading the archive.

```text
application summary
    current runtime and application state
    .history/                         [history-index loading group]
        manifest
        active-segment
        checkpoints/                  [history-data loading group]
            <checkpoint-id>/
                application state     [without .history]
                matching protocol state
        ops/                          [history-data loading group]
            <sealed-segment-id>
```

The manifest records the format, document lineage, retention policy, checkpoint coordinates, op ranges and byte sizes, required loading groups, and archived sequence watermark.
Give every summary proposal a distinct archive-generation token; it is published atomically with the summary, not through a separate commit protocol.
Acquisition binds this token to the storage response's immutable summary identity and reference sequence number.
Use document lineage and sequence number for identity; server timestamps provide the time index.
Select completed runtime-batch boundaries, with sequence order resolving timestamp ties.
Do not replay across different document lineages.

Store ops in summary blobs.
Reuse sealed segments through summary handles and rewrite only a size-bounded active segment and the small manifest.
Seal the active segment when it reaches its size limit.
This avoids both rewriting the entire retention window on each summary and creating a tiny blob on every summary.
Segment size and compression are tuning parameters.

## Checkpoints without full-tree serialization

A checkpoint retains real summary state through storage references; it is not a second serialization of the document.
When a checkpoint is due, retain the previous acknowledged summary's application state and its matching loader/protocol state.
Ops bridge from that checkpoint to the current summary.

Construct a shallow application-state wrapper with handles to the previous application's top-level entries, excluding `.history`.
Preserve all other entries, flags, and load metadata, including data stores, aliases, ID-compressor state, partial chunks, attachment mappings, and GC state.
The loader must supply protocol state at the same sequence number; combining old application state with current protocol state is invalid.
The creation summary supplies the first baseline.

**Never reference the previous application root wholesale: it already contains history.**
Doing so would recursively preserve older archives and prevent trimming.
Existing checkpoints are carried forward by handles to their paths in the previous acknowledged summary.

[Summary handles](../../common/driver-definitions/src/protocol/summary.ts) resolve against the last successful summary; see the [ODSP summary upload implementation](../../drivers/odsp-driver/src/odspSummaryUploadManager.ts).
Their referenced objects become part of the new summary's storage graph, so deleting an ODSP file-version entry does not remove objects still retained by the current file.
No `fullTree: true`, historical replay, or asset copying is required to create these checkpoints.

## Checkpoint count and retention

Let `W` be the minimum history duration and `N` the number of nominal checkpoint intervals within that duration.
Create a checkpoint approximately every `W / N`, when summarization runs.
Retain the newest checkpoint at or before the cutoff, plus up to `N` newer checkpoints.
Thus the budget is **`N + 1` checkpoint roots**, excluding current live state.

| Policy | Checkpoint interval | Retained checkpoint roots | Nominal retained duration |
| --- | --- | --- | --- |
| `W = 30 days`, `N = 2` (initial) | 15 days | 3 | 30 to 45 days |
| `W = 30 days`, `N = 4` | 7.5 days | 5 | 30 to 37.5 days |

For example, on day 44 retain checkpoints from days 0, 15, and 30.
On day 45 replace day 0 with day 45; day 15 becomes the oldest baseline.
Retain all ops after the oldest baseline through the archived watermark.
Drop only segments entirely before the required replay range; keep a partially overlapping boundary segment.

The example assumes regular successful summaries.
Use actual checkpoint coordinates when choosing the cutoff anchor, not a count that could discard required coverage.
Summary delays and idle documents can retain more history, including a year or longer.
No background writes are required solely to age out history.
An increased policy cannot recover data already expired.

## Capture and atomic publication

Capture original sequenced messages before runtime decompression, ungrouping, or chunk reassembly.
Preserve the complete envelopes and system messages, not only DDS changes or post-processed runtime events.
This is the stream required by normal container replay.

For a summary at sequence number `S`:

1. Extend archived ops contiguously from the previous archived watermark through `S`.
2. Carry forward retained checkpoints and sealed segments by handle; add a checkpoint if due.
3. Apply the retention policy and emit the new manifest and active segment.
4. Publish current state and history together through the normal summary acknowledgement flow.

The successful summary is the transaction boundary for adding history and dropping old references.
There is no separate attachment upload or archive commit protocol.
If summarization fails, the previous acknowledged summary remains authoritative.
The next summarizer loads that summary and its op suffix, rebuilds the missing archive suffix, and retries.
Do not advance committed history or discard its recovery input on an unacknowledged proposal.

## Attachment lifetime and GC

Retained checkpoint trees include their original attachment references.
The required ODSP contract keeps those attachment blobs alive while the current file's storage graph references them.
Live runtime GC may remove current data stores or attachment mappings without removing references in retained checkpoints.
Do not keep historical data stores alive in the live object graph.

Use ordinary summary attachment references: do not copy asset bytes or add a separate history attachment inventory.
The coverage invariant is that every attachment needed by retained checkpoint-plus-op replay has a storage-visible reference in either the current application summary or a retained checkpoint.
An ID present only in archived ops is insufficient.

Let `C` be the newest retained checkpoint, `A` the previous acknowledged summary, and `B` the proposed summary.
Use their actual reference sequence numbers and server-reference timestamps, not publication times.
Let `D` be the earliest permitted sweep age across participating clients, `L` the session-expiry bound, and `K` the maximum snapshot-cache age.
Supported configurations require `W / N < D` and `D >= L + K + GC safety buffer`, with normal session expiry enforced.
The defaults give `L = 30 days`, `K = 5 days`, a one-day buffer, and `D = 37 days` including sweep grace.
Zero sweep grace is also compatible with the 15-day interval under these bounds.
When sweep is disabled the sweep constraint is vacuous; accelerated test GC settings that violate these bounds are not supported feature configurations.
The session/cache argument also requires new unreference clocks to start after catch-up to a fresh server-reference timestamp.
The [runtime timestamp accessor](src/containerRuntime.ts) returns the last seen message timestamp, which can be old on idle load; verify freshness at GC entry rather than treating wall-clock session age alone as proof.

Under the existing GC session/cache safety contract, the coverage argument is:

1. If `B` is less than one checkpoint interval after `C`, an attachment introduced after `C` cannot yet reach age `D`.
   Earlier attachments are covered inductively by retained roots or their still-present live mappings.
2. Otherwise, retain `A` before publishing `B`, even after a long gap.
   Any mapping present in `A` remains storage-reachable through that checkpoint even if a sequenced sweep removes it from live state before `B`.
3. An attachment introduced after `A` has no unreference timestamp persisted in `A`.
   GC starts a new unreference clock at the current server-reference time, not at a replayed removal's timestamp.
   Session and cache expiry prevent an unacknowledged clock from reaching `D`; an acknowledged clock is saved alongside the attachment mapping and returns to the preceding cases.

Failed proposals do not replace `A` or advance the committed checkpoint coordinate.
A takeover restores persisted unreference timestamps from acknowledged GC state; it must not treat a failed proposal as an acknowledged baseline or extend an expired session.
Checkpoint selection must use these actual coordinates on every successful summary, including the first after a gap.
The implementation must establish this conditional argument with the failure/takeover tests below before enablement; nominal cadence alone is not proof.
Reject feature configurations that cannot satisfy the bounds rather than silently relying on attachment IDs in ops.

Normal attachment entries are storage-visible references; IDs embedded in serialized ops are not a substitute for them.
See [attachment summarization](src/blobManager/blobManagerSnapSum.ts) and [GC timing](src/gc/gcConfigs.ts).
Storage retention through referenced checkpoint trees is a required service contract, to be verified against ODSP rather than inferred solely from the upload implementation.
Dropping the last retained reference permits later storage reclamation; it does not promise immediate physical deletion.

## Loading and historical playback

Normal container boot loads current state, tree descriptors, and loading-group metadata, but not history blob payloads.
Tree metadata overhead is accepted; zero boot impact is not a requirement.
The summarizer loads only the history-index group to extend the archive.
It reuses checkpoints and sealed segments in the history-data group without loading their payloads.

### Generation-consistent preparation

Opening the timeline bulk-loads the whole retained history, including both history loading groups and groups nested in checkpoints.
Preparation must bind group discovery, the manifest, checkpoint trees and blobs, op segments, and archived watermark to one summary generation `G`.

1. Discover the history index for `G`, including its archive token, reference sequence, and complete loading-group closure.
2. Bulk-request those groups for the same immutable summary identity, if the driver/service supports pinning.
   Otherwise request latest, compare the returned generation and archive token with discovery, and discard and retry discovery on any mismatch.
3. Before exposing a preview, validate every required non-attachment blob is present, checkpoint application/protocol coordinates match, and op coverage is contiguous through the manifest watermark.
   A tree-only response, omitted nested group, missing blob, or truncated op segment is not a prepared bundle.
4. Catch the live container up if `G` is newer, then capture and validate a contiguous sequenced suffix from the archived watermark through a fixed playback head.
   Freeze this head for the prepared bundle; subsequent live changes require an explicit refresh.

Never combine a manifest from one generation with a different generation's group payloads or watermark.
Live catch-up cannot recover omitted historical bytes.
Do not fall back to live loading-group snapshots for missing content.
[ODSP's current network snapshot path](../../drivers/odsp-driver/src/odspDocumentStorageManager.ts) does not forward `versionId` for pinning; merely supplying that option does not implement this contract.
Drivers must provide verifiable generation identities and completeness, or add explicit service support.
Any pinning capability must use the current file's retained storage graph, not require ODSP file-version history.
If generation validation repeatedly races with summarization, fail within the preparation budget; reliable progress under continuous publication may require pinned or atomic all-groups service reads.

### Resource envelope and cancellation

Whole-window preparation is supported only within a host's explicit, benchmarked limits.
One 500-byte message per second produces about 1.30 GB over 30 days before checkpoint data and decoded-object overhead.
The ordinary ODSP snapshot path defaults to a 500 MB limit and two-minute timeout and can fall back to tree metadata without blobs; neither that fallback nor disabling all limits is acceptable preparation.

Before enabling the feature, each supported host profile must publish concrete values for these limits; they are deployment parameters, not universal format constants.

| Limit | Enforced scope |
| --- | --- |
| Transfer bytes | Checkpoints, ops, and index bytes, including retries; within driver/service request limits |
| Decoded bytes and peak memory | Decoding, cached history, historical runtime, and replay workspace |
| Preparation deadline and generation retries | Discovery, transfer, validation, and initial materialization |
| Replay op count and deadline | Every seek from its selected checkpoint through the target |

Use manifest sizes for an early estimate, then enforce actual transfer, decode, memory, and replay limits.
An `AbortSignal` cancels requests, decoding, and replay; release partial buffers and runtimes without exposing a partial preview.
Return explicit oversized-history, budget-exceeded, cancelled, incomplete-content, or generation-changed outcomes as appropriate.
Oversized histories remain durably captured but are not prepared by this initial whole-window API: do not silently shorten retention, omit checkpoints, or fetch a selected interval.
A prepared bundle guarantees no-fetch seeking only for complete targets within its advertised replay envelope.
If a target exceeds that envelope, return a budget error, not a live-storage fallback.

### Archive-backed document service

Build historical states with a read-only document service, not just a snapshot/blob adapter.
The [loader replay/pause helper](../../loader/container-loader/src/loadContainerToSequenceNumber.ts) calls `container.connect()` to obtain replay messages through delta storage.
Reuse that machinery with the following archive-backed contract, not ODSP-version-based checkpoint discovery:

- Serve checkpoint-matched application and protocol state at sequence `C <= target`, preserving all original load metadata.
  Snapshot, summary-blob, version, and loading-group reads are fulfilled from the prepared in-memory bundle, including previously unrealized data stores.
- Supply in-memory delta storage containing original contiguous messages after `C`, bounded at the exclusive upper limit `target + 1`.
  Missing messages inside the required range are errors, not an empty successful stream.
- Advertise `storageOnly: true` to obtain the loader's synthetic read-only connection.
  Reject real delta-stream connections, op submission, summary publication, and live storage writes.
- Fail explicitly on unavailable content or requests outside the prepared range.
  No historical storage or delta request may escape to the live service after preparation.

Disable history recording and new wall-clock-driven GC activity in historical runtimes while processing recorded messages and deterministic application handlers normally.
This includes application-driven SharedSummaryBlock updates required to reproduce durable state.
The live-only restriction applies to timeline acquisition, not to these internal storage-only playback containers.

Attachment image/video bytes remain ordinary asset loads: attachment references do not inline their payloads in snapshot responses.
Playback uses historical attachment mappings and retained storage IDs, not the live BlobManager's current mappings.
Dispose historical runtimes and their caches when the preview lifetime ends.

## Application integration and impact

Expose asynchronous history preparation, version listing, preview acquisition, and disposal.
Reuse existing asynchronous version-history and version-mark service contracts through an application adapter, preserving timeline UI and preview lifetimes.
Application adapters provide labels, grouping, and projections of the historical model.
Once a preview is acquired, synchronous model reads can run against its in-memory state.
Do not require SharedTree commit IDs, retained ancestry, forks, or rewind APIs.
Restore remains an application-owned operation on the live container.

| Area | Impact |
| --- | --- |
| Runtime and loader | History capture, summary assembly, saved protocol state, and an in-memory replay document service |
| Driver/service | Summary references, generation-consistent bulk reads, completeness and cancellation; no ODSP version-history dependency |
| Boot | More tree metadata, but no history payload fetch or replay |
| Summarization | New op bytes and bounded active-segment rewrites; checkpoint roots reuse stored trees |
| Timeline open | Budgeted bulk transfer and memory for retained history; no history-network fetches for supported prepared seeks |
| Storage | Retained checkpoint graph, op segments, and attachment lifetimes extended by retained references |

## Required enablement validation

These are implementation and service validation requirements, not tests implemented by this documentation proposal.

- Race group discovery with publication of a checkpoint introducing a new loading group.
  Require generation mismatch/retry or an atomic pinned response; never expose an incomplete preview.
  Test repeated publication, retry exhaustion, tree-only responses, missing blobs, cancellation, and every resource limit.
- Compare replay with recorded live states across DDS types, data-store attachment/deletion, unreferenced subtrees, and batch/compression/chunk boundaries.
  Include deterministic application-driven SharedSummaryBlock updates, not only its checkpoint serialization.
- After successful preparation, reject every external history-storage and delta-stream request while seeking and realizing previously unloaded data stores.
  Allow only the in-memory delta-storage contract and the deliberate attachment-byte exception.
- At every acknowledged summary, assert the attachment coverage invariant against the complete retained graph.
  Exercise checkpoint boundaries, long gaps, failures before upload and before acknowledgement, rejected proposals, summarizer takeover, and expired sessions.
  Include cold loads of old op suffixes and cached snapshots to establish the reference-time freshness prerequisite.
  Verify persisted unreference clocks and actual checkpoint coordinates with default and supported non-default GC policies, including zero grace and disabled sweep; reject incompatible policies.
- In an ODSP-backed test, remove live attachment mappings and delete older ODSP version entries, then read historical assets through the current summary's retained graph.
  Exercise the service reclamation boundary so a pass does not merely depend on delayed deletion.
- Verify boot excludes history payloads and profile transfer bytes, decoded/peak memory, preparation cost, and worst supported seek replay.
  Publish host-profile limits before enablement, and tune `N` and segment size within those limits and the GC bounds.
