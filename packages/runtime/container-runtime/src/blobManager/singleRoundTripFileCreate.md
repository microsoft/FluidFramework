# Single-round-trip creation of detached containers with blobs (design exploration)

> Status: **Phase 1 implemented.** See [Implementation status](#implementation-status) for what
> actually shipped and how it maps to this design.
>
> See also [comparisonWithPr27880.md](./comparisonWithPr27880.md) for a comparison against
> [PR #27880](https://github.com/microsoft/FluidFramework/pull/27880), which solves the same
> problem via a different mechanism, and for gaps in this design (rehydrate, incremental reuse,
> old-client compatibility) surfaced by that comparison.

## Goal

**Primary goal**: creating a detached container that has one or more blobs uploaded via
`uploadBlob()` should require exactly **one network round trip** — the same way creating a
container with no blobs already does today — instead of today's `N + 2`.

Scope is deliberately narrow: this is entirely about `uploadBlob()`-created attachment blobs. There
is no other kind of content in play, and nothing about how those blobs behave after creation
changes. See [Guiding invariant](#guiding-invariant).

### The problem today

Today, `BlobManager.createBlobDetached` (`blobManager.ts`) uploads each blob to
`IContainerStorageService` (backed by an in-memory `MemoryDetachedBlobStorage` while detached) and
gets back a pseudo storage id, recorded in `redirectTable`. That upload is local/in-memory and
free — but at actual `container.attach()` time, `runRetriableAttachProcess`
(`container-loader/src/attachment.ts`) does the following, **strictly in sequence**:

1. Create an empty file at the real service (one round trip) — only needed because there are
   outstanding blobs; skipped entirely if there are none.
2. For **every** blob in `MemoryDetachedBlobStorage`, call `storage.createBlob(blob)`
   individually against real storage to get a real storage id — **one round trip per blob**.
3. Once every blob has a real id, patch the pseudo→real id map into the runtime
   (`ContainerRuntime.createSummary(blobRedirectTable)` → `BlobManager.patchRedirectTable()`),
   regenerate the summary tree with the now-known real ids, and upload it via
   `uploadSummaryWithContext` — one final round trip.

So today, attaching a container with `N` blobs costs `N + 2` round trips if `N > 0`, versus `1`
round trip if `N === 0`. This is the thing we want to fix.

### Guiding invariant

There should be **no user-visible behavior change**, other than `attach()` taking one network
round trip instead of `N + 2` when blobs are involved. In particular:

* Each `uploadBlob()` call still returns a real `IFluidHandle`, exactly as today.
* Once attached, the blob is a normal attachment blob: excluded from summaries as raw content and
  represented by a `SummaryType.Attachment` entry (id only), read back on demand via
  `readBlob(id)`, and it stays that way in every subsequent summary — that's just Fluid's ordinary
  incremental summarization (an unchanged subtree isn't regenerated, it's referenced via
  `SummaryType.Handle` back to the previous summary), nothing new is needed for that to keep
  working.
* GC reachability is unaffected: standard handle-based mark/sweep, unchanged, whether the blob was
  created while detached or after attach — see [Garbage collection](#garbage-collection).

The proposal restricts the new behavior to **detached containers**, specifically the
detached→attaching transition:

* A new option under `ContainerRuntimeOptions` enables this mode.
* It only changes *how attach uploads outstanding detached blobs*. Nothing about attached-mode
  behavior (periodic summaries, blob upload after attach, GC) changes at all.

## Why detached-only is the right first cut

Restricting to the detached→attaching transition avoids essentially every hard problem that would
otherwise dominate this feature: no op sequencing, no reconnect/resubmit, no multi-client races, no
TTL-expiry handling — there is exactly one client, doing local work, before the document ever talks
to a service.

## What already exists that this design builds on

* `BlobManager.createBlobDetached` (`blobManager.ts`) — local, in-memory pseudo-id assignment via
  `IDetachedBlobStorage`; the actual blob bytes stay resident in memory the whole time a container
  is detached (that's how `IDetachedBlobStorage` already works today).
* Each `uploadBlob()`-created blob is represented, in the summary, as a subtree containing a
  `SummaryType.Attachment` node holding the (pseudo, while detached) id — this is what
  `BlobManager` already builds today; it just isn't uploaded in the same request as the rest of the
  summary.
* A `SummaryType.Blob` node's bytes already travel as ordinary content embedded directly in the one
  request `uploadSummaryWithContext`/`createNew` sends to storage — no driver-level "bundling"
  capability is needed for content to ride along inside a summary tree; that's the existing,
  unremarkable mechanism every driver already implements for any inline content.
* `runRetriableAttachProcess` (`container-loader/src/attachment.ts`) already has a code path — used
  whenever there are no outstanding detached blobs — that does exactly one round trip: build the
  summary, call `uploadSummaryWithContext` once, done. The goal is to make that the *only* path,
  by having `container-runtime` never leave a blob's bytes needing a separate upload.

## Proposed design

`BlobManager` puts each detached blob's bytes into its own subtree in the summary it builds for
attach, as an ordinary `SummaryType.Blob` node — instead of leaving those bytes only in
`IDetachedBlobStorage` for the loader to upload separately later, and instead of ever representing
them as `SummaryType.Attachment` while detached. One subtree per blob (rather than one flat list)
matters for [garbage collection](#garbage-collection): it's what lets an individual unreferenced
blob be dropped later without touching anything else in the tree. The resulting single
`ISummaryTree` — containing the data store trees, the protocol tree, and now every outstanding
blob's subtree too — is uploaded by `container-loader` exactly the way it already uploads a
no-blobs summary today: one `uploadSummaryWithContext` call. `container-loader` needs no new logic
and no new blob-awareness at all — from its point of view there are simply zero outstanding
detached blobs, because `BlobManager` never populates `IDetachedBlobStorage` in this mode. The
`"outstanding"`/`"done"`/empty-file-first branching in `runRetriableAttachProcess` doesn't need to
change at all; every case already goes through the existing `blobs: "none"` path.

Crucially, **the driver sees no attachment blobs whatsoever** — the tree it receives contains only
`SummaryType.Blob` content, keyed by the blob's local id, nested under each blob's own subtree.
This is exactly what the driver already does today for any ordinary inline summary content; nothing
about how it persists a create-file request changes, and no driver code needs to recognize
anything as "attachment-shaped." The driver does not get back — and does not need — a real storage
id for these blobs, because nothing in `container-runtime` needs one:

* While the originating client is alive, resolving a handle to one of these blobs is served
  straight from the bytes already held in memory (the same bytes `BlobManager` put in the
  summary) — no `readBlob(id)` network call, no dependency on any storage id at all.
* A summarizer client (whether it's the same process reloading, or a genuinely separate client)
  loads fresh from the persisted snapshot. It has no need to distinguish "this used to be a
  detached blob" from any other summary blob — it just sees `SummaryType.Blob` content in the tree,
  the same as any other data. It never sees the pre-attach in-memory state and has no stale ids to
  reconcile.

Put differently: this design does not turn these blobs into attachment blobs at all, in the
`SummaryType.Attachment` sense — it keeps them as ordinary summary blobs, permanently, embedded in
their own subtree so they can still be individually added/removed across summaries the same way
`BlobManager` already manages attachment-blob subtrees today. There is no id-patching step, no
driver response-shape change, and no notion of "converting" a blob from one representation to
another after the fact.

### Excluding embedded blobs from the initial snapshot fetch (`groupId`)

Being a permanent `SummaryType.Blob` (rather than a `SummaryType.Attachment`) does **not**, by
itself, keep a blob's bytes out of snapshot downloads — ordinary summary content is always part of
whatever snapshot a client fetches. The original motivation for this whole feature (see
[Goal](#goal)) was SPO's `loadingGroupId` capability, which lets a *subtree* be excluded from the
initial snapshot fetch and instead fetched lazily, on demand, via a separate
`getSnapshotForLoadingGroupId` call keyed by that subtree's `groupId`. So each embedded blob's own
subtree carries `summary.groupId = <localId>` (`blobManagerSnapSum.ts`). This is exactly the same
mechanism `dataStoreContext.ts` already uses for a data store's `loadingGroupId`
(`summarizeResult.summary.groupId = this.loadingGroupId`) — nothing new to the runtime, just a new
place it's applied.

These are three independent properties of an embedded blob, and it's worth being explicit that
there's no contradiction between them:

1. It is ordinary, permanent `SummaryType.Blob` content — never `SummaryType.Attachment`.
2. It is (eventually — see [Known gap](#known-gap-no-incremental-reuse-yet)) reused via
   `SummaryType.Handle` across summaries when unchanged, exactly like any other unchanged summary
   subtree.
3. It is excluded from the *initial* snapshot fetch because its subtree carries a `groupId` —
   fetchable on demand via the loading-group snapshot API, or (before attach, or for the client
   that created it) served directly from the bytes already resident in memory.

### Known gap: no incremental reuse yet (while the original client stays live)

Because Phase 1 is scoped to "create-and-exit" (see [Implementation status](#implementation-status)),
`BlobManager.summarize()` regenerates every embedded blob's subtree from scratch on every call —
there is no child summarizer-node tracking a "this blob was already captured in an acked summary,
reuse it as a handle" state. This is fine for Phase 1: the client that creates the file calls
`createSummary()` (via `container.attach()`) exactly once and then the session ends. It only
becomes a real gap once the *same, still-live* client keeps running past attach and produces
further tracked summaries of its own — that's Phase 2 territory (see the discussion in the
implementation history/PR); giving each embedded blob its own child summarizer node (mirroring how
data stores get one via `getCreateChildSummarizerNodeFn`/`createChild`) is the natural fix, but
doing so would force `BlobManager.summarize()` to become `async`, which cascades into
`ContainerRuntime.createSummary()` — a public, synchronous API called directly and synchronously by
`container-loader` (`container.ts`) specifically *because* it must observe a single consistent
point-in-time snapshot of runtime state (an `async` `createSummary()` could observe a torn/partial
state across an `await` point). Any fix for this gap has to preserve that synchronicity, e.g. by
tracking a lightweight "already captured, reuse a handle" flag per blob directly inside
`BlobManager` (blobs are immutable once created, so this doesn't need anywhere near the full
generality `SummarizerNode` provides for mutable DDS content) rather than reusing `SummarizerNode`
machinery wholesale.

Note this gap is strictly about the *original* client re-summarizing its own in-memory state
across repeated calls without ever reloading. It is unrelated to (and much less severe than) the
reload-correctness bug described next, which is already fixed.

### Fixed bug: any freshly-loaded client used to lose embedded blobs entirely

Earlier revisions of this design tracked embedded blobs purely in an in-memory
`embeddedDetachedBlobLocalIds: Set<string>`, populated only inside `createBlobDetached`. Nothing
ever restored that set (or the blobs' bytes) when a `BlobManager` was constructed fresh from a
snapshot — which happens on every ordinary reload, and for every summarizer client. The very next
summary produced by such a freshly-loaded client would therefore omit the
`.embeddedDetachedBlobs` subtree entirely, silently and permanently dropping those blobs from every
future summary. This was a real data-loss bug, not just an efficiency gap, and would have made the
feature unsafe even for the narrow "create and immediately exit" scenario, since that scenario
still typically involves at least one reload (by the same or a different client) to keep working
with the container afterward.

**The fix**: by the time any snapshot exists that contains the `.embeddedDetachedBlobs` subtree,
attach has already completed and the service has assigned a real storage id to each embedded
blob's `content` node (the `groupId` on that subtree only defers *fetching the bytes*, not the
service's assignment of an id to the blob — the subtree/blob-id shape is present in the initial
snapshot fetch regardless of `groupId`). So on load, `loadV1()`
(`blobManagerSnapSum.ts`) now reads each embedded blob's `content` blob id directly from the
snapshot tree and folds it into the ordinary redirect table as a normal (non-identity)
`localId -> storageId` entry — exactly as if it had been an ordinary attachment blob all along.
This "graduates" the blob into standard attachment-blob accounting with **no new state and no new
schema**: `getBlob()`/`hasBlob()` already handle redirect-table entries, `summarize()` already
emits ordinary `Attachment` nodes for them (which are naturally deduplicated/incremental, since
they're addressed by storage id and unchanged `Attachment` nodes collapse to handles across
summaries), `getGCData()` already accounts for them, and `deleteSweepReadyNodes()` already knows how
to remove them once unreferenced. `embeddedDetachedBlobLocalIds` now only ever holds ids for blobs
created *this session*, before their first attach round trip completes.

> **Open validation item**: this fix relies on the assumption that the service (ODSP) actually
> assigns a durable, retrievable storage id to blob content living inside a `groupId`-tagged
> subtree of the attach summary, and that this id remains valid/readable via the ordinary blob-read
> path after the initial (grouped, deferred) fetch. This has not yet been validated against a real
> ODSP endpoint — only against the mock storage used in unit tests. This needs to be verified
> end-to-end against ODSP before this feature can be considered safe to ship, since if that
> assumption doesn't hold, the redirect-table-based fix above would need to be revisited (e.g.
> falling back to re-embedding on every summary, or some other service-specific accommodation).

## Implementation status

Phase 1 (as described above) is implemented, gated behind a new, `@experimental`-tagged
`ContainerRuntimeOptions` flag: **`enableSingleRoundTripFileCreate`**.

* `BlobManager.createBlobDetached` (`blobManager.ts`), when the flag is on, never calls
  `storage.createBlob()` (so `IDetachedBlobStorage` never gets populated, and
  `container-loader`'s `detachedBlobStorage.size > 0` check — the thing that decides whether the
  slower `N + 2` path runs — stays `0`, automatically routing through the existing single-round-trip
  path with zero `container-loader` changes). Instead, the blob's local id is recorded in a new
  `embeddedDetachedBlobLocalIds: Set<string>`, and the blob is immediately marked `"attached"` in
  `localBlobCache` (its bytes simply stay resident in memory).
* `BlobManager.summarize()` (`blobManager.ts`) builds a new subtree, name
  `embeddedBlobsTreeName = ".embeddedDetachedBlobs"` (`blobManagerSnapSum.ts`), alongside the
  existing `.blobs` attachment-blob tree. All embedded blobs are flat entries directly under this
  one shared subtree, **keyed by local id** (there is no storage id, by design — see above), each
  holding the blob's raw bytes as a `SummaryType.Blob` node. The whole subtree carries a single
  shared `groupId = embeddedBlobsGroupId` ("embeddedDetachedBlobs"). The `groupId` is what excludes
  the blobs' bytes from the initial snapshot fetch — see
  [Excluding embedded blobs from the initial snapshot fetch](#excluding-embedded-blobs-from-the-initial-snapshot-fetch-groupid).
  (An earlier iteration of this design gave each blob its own subtree/`groupId`; this was
  simplified to one shared subtree/`groupId`, matching PR #27880's structure, since per-blob
  groupIds provided no benefit and one bulk group-id fetch is no more expensive over the wire than
  fetching several individually — see `comparisonWithPr27880.md`.)
* `hasBlob()` and `getGCData()` were updated to also account for
  `embeddedDetachedBlobLocalIds`, so reachability/GC treats these exactly like any other blob
  `BlobManager` knows about.
* `loadV1()` (`blobManagerSnapSum.ts`) reads the `.embeddedDetachedBlobs` subtree (if present) out
  of the base snapshot and folds each blob's storage id into the ordinary redirect table on load,
  graduating it into standard attachment-blob accounting from then on — see
  [Fixed bug: any freshly-loaded client used to lose embedded blobs entirely](#fixed-bug-any-freshly-loaded-client-used-to-lose-embedded-blobs-entirely).
* **Document-schema gating**: `enableSingleRoundTripFileCreate` is now a
  `IDocumentSchemaFeatures`/`RuntimeOptionsAffectingDocSchema` property (`documentSchema.ts`,
  `containerCompatibility.ts`), exactly like `createBlobPayloadPending`. This means:
  * It requires `explicitSchemaControl` to be enabled (enforced in `containerRuntime.ts`).
  * Once a document's persisted schema records this feature as on, an **old runtime** that
    predates this feature entirely (and therefore doesn't recognize the schema property) will fail
    to load the document outright, via `checkRuntimeCompatibility()`'s existing "unknown runtime
    schema property" check, rather than silently failing to understand
    `.embeddedDetachedBlobs` and dropping the blob from its own redirect table/summaries (the
    old/analyzed risk — see `comparisonWithPr27880.md`'s "Old-runtime compatibility" section).
    This mirrors PR #27880's use of `explicitSchemaControl`/`minVersionForCollab` for the same
    purpose.
  * The actual `BlobManager` construction now reads the *negotiated session value*
    (`this.sessionSchema.enableSingleRoundTripFileCreate`), not the raw requested runtime option,
    consistent with how `createBlobPayloadPending` is threaded through.
  * This closes the "old-runtime compatibility" open question previously tracked in
    `comparisonWithPr27880.md` — see that document for why a purely structural fix (making old
    runtimes tolerate/carry-forward the subtree without understanding it) cannot work here: even if
    an old runtime could safely re-summarize the subtree, its own `serialize()`/
    `getPendingLocalState()` pipeline would still mishandle the raw bytes inside it (a *separate*,
    still-open bug — see [Known gaps](#known-gaps-not-yet-fixed) below).
* Test coverage: `src/test/blobs/blobManager.spec.ts`, `describe("enableSingleRoundTripFileCreate")` —
  verifies no detached-storage upload occurs, the blob is still readable via `getBlob()`, the
  summary contains the new subtree with a shared `groupId` and flat per-blob entries, no
  `SummaryType.Attachment` node is produced for it, and that a freshly-loaded `BlobManager`
  continues to see the blob as an ordinary attachment blob across further summaries, and correctly
  drops it once unreferenced/swept. `src/test/documentSchema.spec.ts` covers the new schema
  property generically (merge/validate/old-client-rejection semantics, shared with all other
  schema-participating features).


This required **zero changes** to `container-loader` or any driver package for the core Phase 1
behavior; the schema-gating addition only touches `container-runtime`.

## Garbage collection

Reachability doesn't change at all: whether a blob created via `uploadBlob()` is considered
referenced is decided exactly the same way regardless of whether it was created while detached or
after attach — standard handle-based mark/sweep, walking the outbound route from whichever DDS's
serialized state stores the handle `uploadBlob()` returned. There is no exemption and no
special-casing here; this design changes nothing about GC. Giving each blob its own subtree in the
attach summary (rather than one shared list) means an individual unreferenced blob can later be
dropped by simply omitting its subtree from a future summary — the same mechanism `BlobManager`
already uses for attachment blobs today.

## Observable behavior

* **API surface**: unchanged. The app opts in via the new `ContainerRuntimeOptions` flag;
  `uploadBlob()`, data store/channel creation, and `container.attach()` keep their existing
  signatures and async semantics.
* **Before `attach()`**: unchanged — nothing crosses the wire while detached, by definition.
* **At `attach()`**: this is the whole point of the change — one network round trip instead of
  `N + 2`. The app-visible `attach()` promise resolves the same way either way, just faster.
* **After creation**: unchanged from how attachment blobs already behave today — excluded from
  every summary/snapshot as raw content, addressed by storage id, fetched on demand via
  `readBlob(id)` whenever the app actually needs the bytes. Nothing about this design changes when
  or how that happens.

## Key assumptions and evidence

This design rests on three assumptions. The first is load-bearing — if it's false, the whole
design is wrong. The other two are lower-stakes.

### 1. A `groupId`-tagged subtree's *structure* (blob-id map, child trees) is still returned in the
initial snapshot fetch — only the *bytes* are deferred

This is confirmed by the driver/protocol code, not just inferred:

* `ISnapshotTree.groupId` (`packages/common/driver-definitions/src/protocol/storage.ts`) is a field
  *on* a tree that is otherwise structurally ordinary — nothing in its type or any parsing code
  conditions the presence of `blobs`/`trees` on `groupId` being absent.
* ODSP's compact-snapshot parser (`odsp-driver/src/compactSnapshotParser.ts`,
  `readTreeSection`/`readBlobSection`) always builds the full `blobs`/`trees` structure for every
  tree node in the response and separately tags `trees[path].groupId` when the wire format marks a
  tree that way — there is no code path that returns a placeholder/empty tree in place of a
  `groupId`-tagged subtree's structure during the *default* (ungrouped) `getSnapshotTree` fetch.
  `odsp-driver/src/test/jsonSnapshotFormatTests.spec.ts` asserts this directly: it decodes a
  snapshot and checks a specific known subtree equals `{ blobs: {}, trees: {}, unreferenced:
  undefined, groupId: undefined }` — i.e., grouped trees round-trip through the parser with their
  full (if here, empty) shape intact.
* The `loadingGroupIds` fetch parameter (`odspDocumentStorageManager.ts`,
  `fetchSnapshot.ts`) is only used to control which trees' **blob contents** get returned in
  `snapshot.blobContents` (a separate `Map<string, ArrayBuffer>` keyed by blob id) — the initial,
  ungrouped fetch (`loadingGroupIds: []`) still returns every tree's shape, with only default-group
  blob content populated. This is exactly the mechanism `dataStoreContext.ts` already depends on for
  ordinary (non-blob) data stores marked with `loadingGroupId` — same code path, same guarantee.

Net: this assumption is well-supported by existing, already-shipped ODSP driver behavior used for
data-store loading groups today. It is not a new, unvalidated behavior specific to this feature —
it's the same guarantee `loadingGroupId` has always provided for any subtree, blob-shaped or not.

### 2. A summary blob's content, once part of an acked summary inside a `groupId`-tagged subtree,
can be read back via the ordinary blob-read path and treated identically to an ordinary attachment
blob's storage id from then on

This is the one flagged as an **open validation item** in
[the bug-fix section above](#fixed-bug-any-freshly-loaded-client-used-to-lose-embedded-blobs-entirely) —
it has *not* been directly proven against a real ODSP endpoint, only against the mock storage used
in unit tests. Unlike assumption 1, this isn't about snapshot-fetch mechanics (which are
well-documented, generic `groupId` behavior); it's specifically about whether ODSP's blob-id
assignment and read-back semantics for a blob inside a summary tree are indistinguishable from
those of a blob uploaded via the dedicated attachment-blob endpoint. Since it is less critical (a
fallback exists — re-embed on every summary, i.e. never "graduate" — if this assumption turns out
false), this is the one item still requiring explicit end-to-end validation against ODSP before
shipping.

### 3. A client that creates the file and does *not* exit right after `attach()` behaves correctly
(no data loss, no crash) — even though Phase 2 (incremental reuse) isn't implemented

Confirmed correct, at the cost of efficiency, not correctness:

* Blob creation while detached (`createBlobDetached`) never produces an op — there is nothing to
  resubmit or reconnect around; `embeddedDetachedBlobLocalIds` is populated purely from local,
  synchronous, pre-attach state, so there's no reconnect/resubmit interaction to worry about here at
  all.
* If the same client keeps running and calls `summarize()` again after attach (without ever
  reloading), `getEmbeddedDetachedBlobs()` re-embeds every such blob's full bytes from
  `localBlobCache` again, every time — this is wasteful (no incremental reuse yet, see
  [Known gap](#known-gap-no-incremental-reuse-yet)) but not lossy or incorrect: the blob is still
  present, still readable, and still summarized correctly on every call.
* Once *any* client reloads (or a summarizer client loads fresh), `loadV1()`'s fix applies and the
  blob graduates into the ordinary redirect table — from that point on it behaves exactly like a
  normal attachment blob, with normal incremental reuse, for every client including the original one
  if it reloads.

So no second phase is required for correctness — only for efficiency (avoiding repeated
re-embedding by a single long-lived client that never reloads). This matches Phase 1's explicitly
narrow scope.

## Known gaps (not yet fixed)

### Serialized/pending container state corrupts embedded blob bytes

**Confirmed via a reproducing unit test** (`snapshotConversionTest.spec.ts`, "Raw (non-UTF8) blob
content is corrupted by the snapshot <-> SnapshotInfo round-trip"), **not yet fixed**.

`container-loader`'s classic pending/serialized-state pipeline
(`convertSnapshotToSnapshotInfo`/`convertSnapshotInfoToSnapshot`/`convertISnapshotToSnapshotWithBlobs`
in `utils.ts`) unconditionally does `bufferToString(blob, "utf8")` on every blob's bytes with no
matching safe decode, in order to make the pending state JSON-serializable. This is lossy for bytes
that aren't valid UTF-8 — exactly the kind of arbitrary binary content `.embeddedDetachedBlobs`
stores. (Note: `getISnapshotFromSerializedContainer`/`convertSummaryToISnapshot` itself does **not**
corrupt bytes — it preserves raw `Uint8Array` content untouched; the corruption is specifically in
the snapshot ⇄ `SnapshotInfo` round-trip used for `Container.serialize()` and
`SerializedStateManager.getPendingLocalState()`/offline-load.)

This bug is **not new to this feature** — the same code path would corrupt any raw binary blob
content, including ordinary attachment blobs, if fed through it (a newer, separate pipeline,
`captureFullContainerState`/`captureReferencedContents.ts`, already solves this correctly for
attachment blobs by classifying blobs by path and base64-encoding binary ones via
`IBase64BlobContents`/`attachmentBlobContents` — the classic pipeline was simply never updated to
match). This feature is affected because it's the first thing that routinely puts large amounts of
raw binary content through the *classic*, un-updated pipeline while still un-graduated (i.e. before
any real summary has replaced `.embeddedDetachedBlobs` with ordinary attachment-blob entries).

**Exact exposure window**: only while a client's serialized-state baseline (`serializedStateManager`'s
`snapshotInfo.snapshot`) is *the create snapshot itself* (the one still containing raw,
un-graduated `.embeddedDetachedBlobs` bytes) — i.e.:
1. `Container.serialize()` called on a still-detached container.
2. `Container.serialize()`/`getPendingLocalState()` called by the creating client, before it ever
   reloads (its `serializedStateManager` was seeded from the create summary at `attach()` time and
   is never refreshed to a later summary while that client stays alive).
3. Any client (old or new) loading fresh from the very first snapshot on the service (before any
   client has produced a second summary that graduates the blobs).

Once *any* client produces a real second summary, `.embeddedDetachedBlobs` is structurally replaced
with ordinary redirect-table entries, and any client whose baseline is that summary or later is
unaffected, regardless of which client produced it.

**Candidate fixes** (not yet chosen): (a) generalize the existing base64-split pattern from
`captureFullContainerState` to the classic `serialize()`/`getPendingLocalState()` pipeline as well
(most correct, fixes the latent bug for ordinary attachment blobs too, moderate size); (b) scope the
same base64 split narrowly to just `.embeddedDetachedBlobs`; (c) have `BlobManager` itself
base64-encode embedded blob content before ever embedding it in the summary (matching PR #27880),
so it's already plain-ASCII by the time it reaches any conversion pipeline — simplest, but ~33%
larger embedded-blob payloads and a bigger design change; (d) add a guard/assert in
`serialize()`/`getPendingLocalState()` that fails loudly instead of corrupting silently, deferring
the real fix.

Document-schema gating (see [Implementation status](#implementation-status) above) does **not**
fix this for old clients: even a structurally "safe" old runtime would still run its own
`serialize()`/`getPendingLocalState()` through the same lossy code, since that code doesn't
distinguish based on whether the runtime "understands" the subtree it's serializing. Schema gating
only prevents old runtimes from loading/joining a document using this feature at all — it doesn't
retroactively make their generic serialization code byte-safe. The corruption bug for *new* clients
still needs one of the candidate fixes above, independent of schema gating.

## Non-goals / open questions

* Version skew / rollout: an old loader is unaffected either way, since this design never touches
  `container-loader` or any driver code — the new `ContainerRuntimeOptions` flag only changes
  in-process `BlobManager` behavior. The remaining open question is purely about the
  `ContainerRuntimeOptions` surface itself: since runtime is deployed independently of loader, the
  flag needs to be something an app can safely turn on regardless of which loader/runtime version
  combination is running, without the loader needing to know about it at all — this is satisfied
  by construction here (loader sees zero outstanding blobs either way), but should be kept in mind
  if this design is ever extended to touch loader or driver behavior.
