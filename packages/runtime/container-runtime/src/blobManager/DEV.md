# Single-round-trip creation of detached containers with blobs (design exploration)

> Status: **Phase 1 implemented.** See [Implementation status](#implementation-status) for what
> actually shipped and how it maps to this design.

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

### Known gap: no incremental reuse yet

Because Phase 1 is scoped to "create-and-exit" (see [Implementation status](#implementation-status)),
`BlobManager.summarize()` regenerates every embedded blob's subtree from scratch on every call —
there is no child summarizer-node tracking a "this blob was already captured in an acked summary,
reuse it as a handle" state. This is fine for Phase 1: the client that creates the file calls
`createSummary()` (via `container.attach()`) exactly once and then the session ends. It only
becomes a real gap once a client keeps running past attach and produces further tracked summaries
of its own — that's Phase 2 territory (see the discussion in the implementation history/PR); giving
each embedded blob its own child summarizer node (mirroring how data stores get one via
`getCreateChildSummarizerNodeFn`/`createChild`) is the natural fix, but doing so would force
`BlobManager.summarize()` to become `async`, which cascades into `ContainerRuntime.createSummary()`
— a public, synchronous API called directly and synchronously by `container-loader`
(`container.ts`) specifically *because* it must observe a single consistent point-in-time snapshot
of runtime state (an `async` `createSummary()` could observe a torn/partial state across an `await`
point). Any fix for this gap has to preserve that synchronicity, e.g. by tracking a lightweight
"already captured, reuse a handle" flag per blob directly inside `BlobManager` (blobs are immutable
once created, so this doesn't need anywhere near the full generality `SummarizerNode` provides for
mutable DDS content) rather than reusing `SummarizerNode` machinery wholesale.

## Implementation status

Phase 1 (as described above) is implemented, gated behind a new, `@experimental`-tagged
`ContainerRuntimeOptions` flag: **`enableSingleRoundTripAttachWithBlobs`**.

* `BlobManager.createBlobDetached` (`blobManager.ts`), when the flag is on, never calls
  `storage.createBlob()` (so `IDetachedBlobStorage` never gets populated, and
  `container-loader`'s `detachedBlobStorage.size > 0` check — the thing that decides whether the
  slower `N + 2` path runs — stays `0`, automatically routing through the existing single-round-trip
  path with zero `container-loader` changes). Instead, the blob's local id is recorded in a new
  `embeddedDetachedBlobLocalIds: Set<string>`, and the blob is immediately marked `"attached"` in
  `localBlobCache` (its bytes simply stay resident in memory).
* `BlobManager.summarize()` (`blobManager.ts`) builds a new subtree, name
  `embeddedBlobsTreeName = ".embeddedDetachedBlobs"` (`blobManagerSnapSum.ts`), alongside the
  existing `.blobs` attachment-blob tree. It contains one child subtree per embedded blob, **keyed
  by local id** (there is no storage id, by design — see above); each child subtree carries
  `groupId = <localId>` and holds the blob's raw bytes as a `SummaryType.Blob` node named
  `"content"` (`embeddedBlobContentBlobName`). The `groupId` is what excludes the blob's bytes from
  the initial snapshot fetch — see
  [Excluding embedded blobs from the initial snapshot fetch](#excluding-embedded-blobs-from-the-initial-snapshot-fetch-groupid).
* `hasBlob()` and `getGCData()` were updated to also account for
  `embeddedDetachedBlobLocalIds`, so reachability/GC treats these exactly like any other blob
  `BlobManager` knows about.
* The new option is excluded from `RuntimeOptionsAffectingDocSchema`
  (`containerCompatibility.ts`) — it changes only local, detached-only upload behavior and has no
  effect on the shape of documents produced, so it doesn't participate in doc-schema compat
  negotiation.
* Test coverage: `src/test/blobs/blobManager.spec.ts`, `describe("enableSingleRoundTripAttachWithBlobs")` —
  verifies no detached-storage upload occurs, the blob is still readable via `getBlob()`, the
  summary contains the new subtree keyed by local id with `SummaryType.Blob` content, and no
  `SummaryType.Attachment` node is produced for it.

This required **zero changes** to `container-loader` or any driver package, confirming the design
conclusion above.

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

## Non-goals / open questions

* Version skew / rollout: an old loader is unaffected either way, since this design never touches
  `container-loader` or any driver code — the new `ContainerRuntimeOptions` flag only changes
  in-process `BlobManager` behavior. The remaining open question is purely about the
  `ContainerRuntimeOptions` surface itself: since runtime is deployed independently of loader, the
  flag needs to be something an app can safely turn on regardless of which loader/runtime version
  combination is running, without the loader needing to know about it at all — this is satisfied
  by construction here (loader sees zero outstanding blobs either way), but should be kept in mind
  if this design is ever extended to touch loader or driver behavior.
