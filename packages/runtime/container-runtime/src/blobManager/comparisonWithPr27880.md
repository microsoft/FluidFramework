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
| Tree shape | One subtree *per blob*, each with its own `groupId = localId` | One shared subtree (`.blobs/.detached`) for *all* detached blobs, one shared `groupId` |
| Blob encoding | Raw bytes (`SummaryType.Blob` with `Uint8Array`) | Base64-encoded text |
| After first attach-summary ack | "Graduates": folded into the ordinary redirect table, becomes indistinguishable from a normal attachment blob forever after | Stays "special" forever: tracked in a permanent `detachedBlobSummaryIds` set, decoded on every read, encoded on every full-tree re-summarize |
| Incremental reuse across summaries (same live client, no reload) | Not yet — every embedded blob is re-embedded on every `summarize()` call until the client reloads (documented gap) | Yes — unchanged blobs are emitted as `SummaryType.Handle` from the very first non-full-tree summary after creation, no reload needed |
| Document schema | Not gated — a flag with only local, in-process effect on detached-only behavior | Gated behind `explicitSchemaControl` + `minVersionForCollab: "2.115.0"`, a real document-schema-participating flag |
| Loader changes | None | `captureReferencedContents.ts`/`captureFullContainerState` updated to recurse into `.blobs` child trees |
| Full-tree summarization | Not separately handled — after graduation, ordinary attachment-blob full-tree summarization already applies | Explicit `summarizeFullTree()`/`loadFullTreeContents()` path, since a full-tree summary can't reuse handles and must re-materialize/re-encode content from storage |
| Detached-container serialize/rehydrate | Not implemented/tested — likely broken today (see [Rehydrate gap](#rehydrate-gap-in-this-prs-design)) | Explicitly designed for — base64 encoding exists specifically because the loader's `serialize()`/rehydrate path re-encodes all blob content as UTF-8 text |

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

## Old-runtime compatibility of the redirect-table-graduation fix

For this PR's design, `loadV1()` reads an optional `.embeddedDetachedBlobs` subtree if present, and
does nothing special if it's absent. An **old runtime** (one that predates this feature, and has no
knowledge of `.embeddedDetachedBlobs` at all) loading a summary that *does* contain this subtree
will:

* Correctly skip over it in `loadV1()`, since that function only ever reads `blobsTree.trees` for
  the single sibling key it explicitly knows about (`embeddedBlobsTreeName`) — an old build not
  containing that check simply never looks at `blobsTree.trees` for this purpose and won't be
  affected by whatever else lives there.
* However, this means the old runtime's `redirectTable`/`ids` will **not** include the blob at all
  — the blob is invisible to it. It won't crash, but it also won't be able to `getBlob()`/GC-track
  that blob correctly: an old client wouldn't reference-count it via the normal redirect-table path,
  so if that old client itself produces a summary, it would silently omit the still-referenced
  blob's subtree (mirroring the exact "any freshly-loaded client loses embedded blobs" bug this PR's
  own fix addresses for *this* codebase — but for an *old*, pre-fix codebase, this can't be patched
  after the fact). This is a real version-skew risk for old runtimes reading documents produced by
  this feature, and is exactly the kind of thing document-schema gating (`explicitSchemaControl`)
  exists to prevent. It needs further thought — either the flag should also participate in
  doc-schema negotiation (mirroring PR #27880's choice) or the design needs an explicit compatibility
  story for old readers (e.g. some other structural fallback), rather than assuming "no schema
  impact" by construction. See [Open question: do we need a schema flag too?](#open-question-do-we-need-a-schema-flag-too).

## The "single shared tree" vs "one subtree per blob" trade-off

PR #27880 puts every detached blob under one shared subtree (`.blobs/.detached`) with a single
shared `groupId`. This PR instead gives each blob its own subtree with its own `groupId`. Both are
viable designs for the *first* summary; the difference shows up in two places:

1. **Deferred-fetch granularity.** Because PR #27880's blobs share one `groupId`, the first time
   *any* of them is needed (or during a detached-container rehydrate, which pulls the whole
   `.detached` tree by design), the loading-group fetch for that shared group returns *all*
   detached blobs' content together — there's no way to fetch just one without also pulling its
   siblings' bytes. This PR's per-blob `groupId` avoids that coupling: each blob is independently
   fetchable. This matters more for the *deferred/on-demand* fetch path (before any graduation has
   happened) than for the steady state after attach, where reads go through the ordinary
   single-blob `readBlob(storageId)` call regardless of design.
2. **Post-attach representation.** PR #27880's blobs never leave the shared tree/base64
   representation, so this coupling is permanent. This PR's blobs graduate into ordinary,
   independently-addressed attachment blobs after the first load, so the per-blob-subtree structure
   (and its independent fetch granularity) only matters transiently, before that graduation happens.

This is a real, legitimate trade-off (fewer subtrees / less structural overhead vs. finer fetch
granularity), not a correctness difference — and importantly, it's a trade-off this PR's design
could adopt later without a wire-format rewrite: switching to a single shared subtree/groupId would
only require changing what `summarize()`/`loadV1()` do with that subtree, not redesigning the
overall approach. This is worth prioritizing only if the additional per-blob-subtree overhead turns
out to matter in practice.

## Rehydrate gap in this PR's design

This PR's design has not been evaluated against `Container.serialize()`/
`rehydrateDetachedContainerFromSnapshot`. Tracing the code: `serialize()` always calls
`runtime.createSummary()` → `BlobManager.summarize()`, which (with this feature's flag on) emits
raw bytes inside `.embeddedDetachedBlobs/<localId>/content` as an ordinary `SummaryType.Blob` node.
`convertSummaryToISnapshot` (`container-loader/src/utils.ts`) then unconditionally does
`bufferToString(content, "utf8")` on every blob's content so the whole tree can be JSON-serialized
— exactly the corruption risk PR #27880's base64 encoding was built to avoid. This means
**serializing a detached container that has embedded blobs, under this PR's current
implementation, is untested and likely produces corrupted blob bytes on rehydrate.** This is a real
gap that needs to be either fixed (most likely by adopting some form of lossless text encoding for
embedded blob content, mirroring PR #27880) or explicitly scoped out for Phase 1 (e.g. documented
as unsupported, with a guard/assert against calling `serialize()` while outstanding embedded blobs
exist).

## Open question: do we need a schema flag too?

Not yet resolved, and intentionally not implemented as part of this PR without further discussion.
PR #27880 gates its flag behind `explicitSchemaControl`/`minVersionForCollab` because its on-disk
shape is permanently different from what an old, schema-unaware client understands (blobs
permanently live as base64 text under a differently-named subtree it wouldn't decode correctly).
This PR's current claim of "no doc-schema impact" rests on the assumption that after graduation, an
old client sees only things it already understands (ordinary `Attachment` nodes + redirect table).
That's true for the *steady state*, but as noted above, an old client reading the very *first*
summary (containing `.embeddedDetachedBlobs`, before any graduation has happened) does not
understand that subtree, silently drops the blob from its own redirect table, and would propagate
that loss into any summary it produces. Whether this is acceptable (e.g. if old-client-reads-new-doc
is out of scope for Phase 1, or if there's some other mitigation) or requires schema
participation after all is an open question that should be settled before removing the
"@experimental" tag from this feature.

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
