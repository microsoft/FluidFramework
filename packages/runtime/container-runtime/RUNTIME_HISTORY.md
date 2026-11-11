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

The manifest records the format, document lineage, retention policy, checkpoint coordinates, op ranges, and archived sequence watermark.
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
ODSP keeps those attachment blobs alive while the current file's storage graph references them.
Live runtime GC may remove current data stores or attachment mappings without removing references in retained checkpoints.
Do not keep historical data stores alive in the live object graph.

Use ordinary summary attachment references: do not copy asset bytes or add a separate history attachment inventory.
This requires a checkpoint to capture an attachment before live GC can sweep its last current mapping.
An attachment introduced and swept entirely between retained checkpoints would otherwise exist only as an ID in archived ops.
Keep the configured checkpoint interval below the earliest permitted runtime sweep age.
The initial 15-day interval satisfies the current default GC timings; different GC settings or longer history policies must preserve this bound, increasing `N` if necessary.
After a long summary gap, retaining the preceding successful summary before replacing it also preserves its attachment references.

Normal attachment entries are storage-visible references; IDs embedded in serialized ops are not a substitute for them.
See [attachment summarization](src/blobManager/blobManagerSnapSum.ts) and [GC timing](src/gc/gcConfigs.ts).
Dropping the last retained reference permits later storage reclamation; it does not promise immediate physical deletion.

## Loading and historical playback

Normal container boot loads current state, tree descriptors, and loading-group metadata, but not history blob payloads.
Tree metadata overhead is accepted; zero boot impact is not a requirement.
The summarizer loads only the history-index group to extend the archive.
It reuses checkpoints and sealed segments in the history-data group without loading their payloads.

When opening the timeline, bulk-load all history checkpoint, op, and index blobs in one history acquisition.
Request both history loading groups, not just the parent group's ID.
Include loading groups nested in retained checkpoints so the bundle is complete.
If the fetched snapshot is newer than the live container, use live catch-up before exposing the bundle.
Combine its archived watermark with the live container's sequenced suffix to establish a consistent playback head.

Build historical states from the in-memory bundle using a checkpoint and forward replay.
The historical storage adapter supplies the selected checkpoint as the container root and serves summary blobs from memory.
Reuse [loader replay/pause behavior](../../loader/container-loader/src/loadContainerToSequenceNumber.ts), not ODSP-version-based checkpoint discovery.
Disable history recording and new GC activity in historical runtimes while processing recorded messages normally.
Seeking must not trigger more history-storage requests.

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
| Runtime and loader | History capture, summary assembly, saved protocol state, and in-memory replay storage |
| Driver/service | Existing summary references and bulk loading groups; no ODSP version-history dependency |
| Boot | More tree metadata, but no history payload fetch or replay |
| Summarization | New op bytes and bounded active-segment rewrites; checkpoint roots reuse stored trees |
| Timeline open | Bulk transfer and memory for retained history; no storage fetches during seeks |
| Storage | Retained checkpoint graph, op segments, and attachment lifetimes extended by retained references |

Validate replay against recorded live states across multiple DDS types, data-store attachment/deletion, and batch/compression/chunk boundaries.
Exercise unreferenced subtrees, attachment introduction/removal/GC, checkpoint rollover, summary failure and takeover, and idle gaps.
Verify that boot excludes history payloads, bulk acquisition includes nested groups, and seeking does not fetch more history.
Tune `N` and segment size using summary cost, retained tree metadata, timeline-open memory, and replay latency.
