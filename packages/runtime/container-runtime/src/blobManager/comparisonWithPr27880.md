# Comparison with PR #27880 (`inlineDetachedBlobsAsSummaryBlobs`)

> This is a comparison between this PR's design (see
> [singleRoundTripFileCreate.md](./singleRoundTripFileCreate.md)) and
> [PR #27880](https://github.com/microsoft/FluidFramework/pull/27880), "feat: support
> single-request create with detached blobs", which solves the same underlying problem — a detached
> container with `uploadBlob()`-created blobs should be able to `attach()` in one network round
> trip instead of `N + 2` — via a materially different mechanism. Both PRs were developed
> independently and were not aware of each other until this comparison was written.

## Summary of the two approaches

Both designs share the same starting point: stop uploading detached blobs to
`IDetachedBlobStorage` up front, and instead embed their bytes directly into the attach summary, so
`container-loader`'s existing "no outstanding blobs" attach path (a single `uploadSummaryWithContext`
call) is used unchanged. Both rely on the same SPO capability — a summary subtree tagged with
`groupId` is excluded from the *initial* snapshot fetch, but its structure (blob-id map, child
trees) is still returned; only the bytes are deferred, fetchable later via the loading-group
snapshot API or the ordinary blob-read API. Where they diverge is in what happens to a blob's
representation after that first summary, and what compatibility guarantees they provide.

| | This PR | PR #27880 |
|---|---|---|
| Flag name | `enableSingleRoundTripFileCreate` | `inlineDetachedBlobsAsSummaryBlobs` |
| Tree shape | One shared subtree (`.blobs/.embeddedDetachedBlobs`) for all embedded blobs, one shared `groupId` | One shared subtree (`.blobs/.detached`) for *all* detached blobs, one shared `groupId` |
| Blob encoding | Raw bytes (`SummaryType.Blob` with `Uint8Array`) | Base64-encoded text |
| After first attach-summary ack | "Graduates": folded into the ordinary redirect table, becomes indistinguishable from a normal attachment blob forever after | Stays "special" forever: tracked in a permanent `detachedBlobSummaryIds` set, decoded on every read, encoded on every full-tree re-summarize |
| Incremental reuse across summaries (same live client, no reload) | Not yet — every embedded blob is re-embedded on every `summarize()` call until the client reloads (documented gap) | Yes — unchanged blobs are emitted as `SummaryType.Handle` from the very first non-full-tree summary after creation, no reload needed |
| Document schema | Gated behind `explicitSchemaControl`, a real document-schema-participating flag (as of this session's fix) | Gated behind `explicitSchemaControl` + `minVersionForCollab: "2.115.0"`, a real document-schema-participating flag |
| Loader changes | None | `captureReferencedContents.ts`/`captureFullContainerState` updated to recurse into `.blobs` child trees |
| Full-tree summarization | Not separately handled — after graduation, ordinary attachment-blob full-tree summarization already applies | Explicit `summarizeFullTree()`/`loadFullTreeContents()` path, since a full-tree summary can't reuse handles and must re-materialize/re-encode content from storage |
| Detached-container serialize/rehydrate | Confirmed broken (see [singleRoundTripFileCreate.md's "Known gaps"](singleRoundTripFileCreate.md#known-gaps-not-yet-fixed)) — not yet fixed | Explicitly designed for — base64 encoding exists specifically because the loader's `serialize()`/rehydrate path re-encodes all blob content as UTF-8 text |

## Why PR #27880 needs base64 encoding, and why that's not really about storage

It's tempting to assume base64 is needed because "the service only stores blobs as text" — that's
not the reason, and it's not true of ODSP: `IDocumentStorageService.readBlob()` returns
`ArrayBufferLike` (raw bytes), same as any other attachment blob. The real reason is
`container-loader`'s **detached-container serialize/rehydrate path**
(`Container.serialize()`/`rehydrateDetachedContainerFromSnapshot`,
`container-loader/src/utils.ts`): to serialize a detached container's state to a string (so it can
be persisted and rehydrated later, e.g. for offline/pending-state scenarios),
`convertSummaryToISnapshot` takes every `SummaryType.Blob` node's content and does
`bufferToString(content, "utf8")` so the whole tree can be `JSON.stringify`'d. Raw binary content
does not round-trip correctly through a UTF-8 string interpretation — bytes that don't form valid
UTF-8 get corrupted or throw. PR #27880's blobs are base64-encoded specifically so that this
generic, always-applied UTF-8 re-encoding step doesn't corrupt them: base64 text is plain ASCII and
survives being treated as UTF-8. So yes — once *read back* via `readBlob()`, the content is fetched
as ordinary bytes; those bytes just happen to *be* a base64-encoded string, which then needs an
explicit `decodeDetachedSummaryBlob` step to recover the original binary payload. It is not that
storage requires text — it's that the loader's serialize/rehydrate mechanism does, and PR #27880's
design pays that cost unconditionally (every blob, every time), because it wants rehydrate to work
correctly from day one.

## Incremental reuse: what "doesn't re-embed on every summary" actually means

For the single client that creates the file, there is normally no "further tracked summary" beyond
the one produced for `attach()` — a detached container only calls `createSummary()` again if the
app explicitly calls `container.serialize()` (to persist detached/pending state) or if attach
itself is retried. Both use the *same* synchronous `BlobManager.summarize()` used everywhere else,
via `ContainerRuntime.createSummary()`/`addContainerStateToSummary()`.

PR #27880 solves the "don't re-embed unchanged blobs" problem by keeping a `localBlobCache` entry
(and hence the raw bytes) around for a detached-summary blob even *after* attach, and having
`summarize()` check: if the bytes are still resident in `localBlobCache`, embed them again (subject
to the base64 encoding above); if they've been evicted (e.g. after a real attached-summary
handshake or on a freshly-loaded client where `localBlobCache` starts empty), just emit a
`SummaryType.Handle` pointing at the last acked location — no re-embedding. In practice, for the
*very first* summary after a blob is created, its content is always freshly embedded, since it was
never previously summarized. Incremental *reuse* only kicks in from the second summarize() call
onward for a blob that was already captured — which does still meaningfully help this PR's
"non-reload, still-live client producing repeated summaries" scenario (e.g. multiple `serialize()`
calls, or attach retries), which is precisely the gap our design leaves open.

**Could our design do the same thing without reloading?** Yes, in principle: we would need
`BlobManager.summarize()` to remember which embedded blobs were already captured in a previous
summary and represent them as a handle rather than re-embedding raw bytes — the same shape of fix
PR #27880 applies, just without the base64 step (since we don't yet support rehydrate). This is
exactly the Phase 2 idea sketched in `singleRoundTripFileCreate.md`'s "Known gap" section (a
lightweight per-blob "already captured" flag, since these blobs are immutable once created and
don't need full `SummarizerNode` generality). PR #27880 is useful evidence that this is a tractable,
already-precedented fix — worth prioritizing given the theoretical data pressure it removes.

## Old-runtime compatibility of the redirect-table-graduation fix — RESOLVED via schema gating

**Update**: this is now fixed. `enableSingleRoundTripFileCreate` is a
`IDocumentSchemaFeatures`/`RuntimeOptionsAffectingDocSchema` property (mirroring PR #27880's
`explicitSchemaControl`/`minVersionForCollab` approach exactly), requires `explicitSchemaControl`,
and participates in normal doc-schema merge/negotiation. See
[Implementation status](singleRoundTripFileCreate.md#implementation-status) for details. The
analysis below is preserved for context on *why* this was needed.

For this PR's design (prior to the schema-gating fix), `loadV1()` reads an optional
`.embeddedDetachedBlobs` subtree if present, and does nothing special if it's absent. An **old
runtime** (one that predates this feature, and has no knowledge of `.embeddedDetachedBlobs` at all)
loading a summary that *does* contain this subtree would:

* Correctly skip over it in `loadV1()`, since that function only ever reads `blobsTree.trees` for
  the single sibling key it explicitly knows about (`embeddedBlobsTreeName`) — an old build not
  containing that check simply never looks at `blobsTree.trees` for this purpose and won't be
  affected by whatever else lives there.
* However, this means the old runtime's `redirectTable`/`ids` would **not** include the blob at all
  — the blob is invisible to it. It won't crash, but it also won't be able to `getBlob()`/GC-track
  that blob correctly: an old client wouldn't reference-count it via the normal redirect-table path,
  so if that old client itself produces a summary, it would silently omit the still-referenced
  blob's subtree (mirroring the exact "any freshly-loaded client loses embedded blobs" bug this PR's
  own fix addresses for *this* codebase — but for an *old*, pre-fix codebase, this can't be patched
  after the fact). This was a real version-skew risk for old runtimes reading documents produced by
  this feature — now closed off by document-schema gating: an old runtime will fail to load such a
  document outright (via `checkRuntimeCompatibility()`'s existing "unknown runtime schema property"
  check), rather than silently mishandling it.

Note that schema gating protects old *runtimes* from silently mishandling the document structurally
(dropping blobs from redirect tables/summaries), but it does **not** by itself fix the separate
serialized/pending-state byte-corruption bug discovered in this session (see
[singleRoundTripFileCreate.md's "Known gaps"](singleRoundTripFileCreate.md#known-gaps-not-yet-fixed))
— that bug affects *new* clients too and needs its own fix, independent of schema gating.

## The "single shared tree" vs "one subtree per blob" trade-off

PR #27880 puts every detached blob under one shared subtree (`.blobs/.detached`) with a single
shared `groupId`. This PR instead gives each blob its own subtree with its own `groupId`.

**Correction after tracing the actual read paths**: an earlier draft of this document claimed the
shared `groupId` causes all detached blobs' content to be fetched together over the network the
first time any one of them is needed. That claim was checked against the code and does not hold in
the cases that matter most:

* **Attached, steady-state reads** (the case relevant to a live, already-attached document): PR
  #27880's `getBlob()` calls `storage.readBlob(storageId)` for exactly one blob at a time — the
  shared `groupId` is not consulted at all in this path, and there is no "fetch the whole group"
  network call here. This is identical in granularity to this PR's per-blob `readBlob()` calls
  after graduation.
* The **only** place all of a client's detached blobs' content is actually loaded together is the
  `BlobManager` constructor's `attachState === AttachState.Detached` branch: when *rehydrating* a
  still-detached container (`rehydrateDetachedContainerFromSnapshot`), it eagerly reads every entry
  in `.detached` via a batched `Promise.all` at construction time, rather than lazily on first
  access. But while detached, `storage.readBlob()` here resolves against the rehydrate payload's
  own local blob map (or an in-memory equivalent) — not a real network round trip to a service — so
  this is an **eager-vs-lazy local hydration choice**, not a network-cost penalty caused by sharing
  one `groupId`. A lazier implementation of the same shared-tree design (decode-on-first-access)
  could avoid this eagerness without needing per-blob subtrees/groupIds at all.

So the two designs are not distinguished by network-fetch granularity in the cases examined so far.
The genuine, verifiable difference is structural: fewer subtrees/less summary-tree overhead (shared
tree) vs. independently addressable subtrees (per-blob groupId) — which matters mainly for how
cheaply an individual blob's entry can be added/removed from the tree across summaries, not for how
its bytes are fetched. PR #27880's plain-blob-entries-in-one-shared-tree structure demonstrates that
per-blob subtrees are not required for cheap incremental add/remove either — a flat, shared tree
with directly-keyed entries supports the same. This PR's per-blob-subtree structure could be
switched to a shared-tree structure later without a wire-format rewrite, if the reduced tree
overhead turns out to matter; this is a lower-priority follow-up than the correctness gaps
identified elsewhere in this document.

## Rehydrate gap in this PR's design — CONFIRMED via reproducing test

This PR's design has now been evaluated against `Container.serialize()`/`getPendingLocalState()`
(offline-load/stash), and the bug is **confirmed** via a reproducing unit test
(`container-loader/src/test/snapshotConversionTest.spec.ts`). The exact corruption point is not
`convertSummaryToISnapshot` (which preserves raw `Uint8Array` bytes untouched) but the *later*
`convertSnapshotToSnapshotInfo`/`convertSnapshotInfoToSnapshot` round-trip in
`container-loader/src/utils.ts`, used by the classic `serialize()`/pending-state pipeline — it
unconditionally does `bufferToString(bytes, "utf8")` with no matching safe decode, which is lossy
for any non-UTF8 binary content. This is not unique to this feature (the same code would corrupt
raw attachment-blob bytes too, if fed through it), but this feature is the first thing that
routinely exercises that path with un-graduated binary content. See
[singleRoundTripFileCreate.md's "Known gaps"](singleRoundTripFileCreate.md#known-gaps-not-yet-fixed)
for the precise exposure window and candidate fixes — this has **not yet been fixed**, and is the
next planned work after schema gating.

## Open question: do we need a schema flag too? — RESOLVED

**Update**: yes, and it's now implemented. `enableSingleRoundTripFileCreate` participates in
document-schema negotiation exactly like PR #27880's flag does (gated behind
`explicitSchemaControl`, merged/validated via the same generic `IDocumentSchemaFeatures` machinery
in `documentSchema.ts`). See [Implementation status](singleRoundTripFileCreate.md#implementation-status).

The reasoning that settled this: a purely structural fix (making old runtimes tolerate/carry the
subtree forward without understanding it) would not have been sufficient even if it had been
pursued instead — an old runtime's own `serialize()`/`getPendingLocalState()` pipeline would still
mishandle the raw bytes generically, regardless of whether the runtime "understands" the subtree
structurally. Since both the GC/redirect-table-loss risk (this section) and the byte-corruption
risk (see `singleRoundTripFileCreate.md`'s "Known gaps") are genuine format incompatibilities for
old runtimes — not just missing optimizations — schema gating (which converts "silent data loss on
old clients" into "loud, safe refusal to load") was the correct tool, matching PR #27880's choice
exactly.

## Net assessment

Both PRs solve the same core problem and rely on the same fundamental SPO guarantee (`groupId`
subtree structure survives the initial fetch; only bytes are deferred). PR #27880 is a more
functionally complete solution — it handles incremental reuse for a live client, full-tree
summarization, and detached-container rehydrate from the outset, at the cost of materially higher
complexity (permanent base64 encoding/decoding, a permanently-tracked "this blob is special" set, a
document-schema flag, and loader-side changes). This PR is a narrower, currently simpler Phase 1
that defers those same problems — incremental reuse, rehydrate, and old-client compatibility all
have exactly analogous unresolved gaps here, they're just not yet implemented rather than being
solved with extra complexity. This convergence is worth calling out explicitly: it is not obvious
that this PR's simplicity is a durable property of the design rather than an artifact of solving a
narrower slice of the same problem — closing these gaps may require adopting solutions similar in
spirit (if not in exact mechanism) to what PR #27880 already implements.
