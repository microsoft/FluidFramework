# MarkTree: a persistent, order-statistics tree for sequence-field compose

**Status:** Prototype / proof of concept. Not integrated into the real `compose()` path.
**Code:** `packages/dds/tree/src/feature-libraries/sequence-field/markTree.ts`,
`packages/dds/tree/src/feature-libraries/sequence-field/composeMarkTrees.ts`
(plus matching test files under `packages/dds/tree/src/test/feature-libraries/sequence-field/`).
**Related work items:** AB#82432 ("Implement efficient sequence field change composition"),
AB#67080 ("Refactor B-tree library to provide foundation for new data structures").

## TL;DR

`compose()` on sequence-field changesets is `O(size(A) + size(B))` today because it walks two flat
`Mark[]` arrays one mark at a time. In the common case where one changeset is a small, localized
edit and the other is a huge no-op over most of the document (e.g. rebasing a long-lived branch's
edits onto a trunk full of unrelated commits), that's a lot of wasted work: the huge no-op run
could, in principle, just be copied into the output by reference without ever being looked at.

This prototype replaces the flat array with `MarkTree`, a persistent (immutable, structurally
shared) counted tree, and reimplements `compose` on top of it (`composeMarkTrees`). For the target
scenario, composing is `O(log n)` instead of `O(n)`: the huge no-op run is spliced into the output
via one tree `concat`, never visiting the marks inside it. Every mark pair that actually needs to be
merged still goes through the real, unmodified `composeMarks` from `compose.ts`, so correctness for
the "genuinely interacting" case rests entirely on already-tested production code.

The prototype is verified correct against the full existing `cases`-matrix cross product used by
`compose.test.ts` (144 pairwise combinations) plus dedicated complexity and move tests, with zero
regressions in the pre-existing `SequenceField` suite (3585 tests). It is **not** wired into the real
`compose()`/`FieldChangeRebaser` — see [Integration plan](#integration-plan-and-why-its-not-done) for
why that's a bigger decision than it sounds.

## Goals

- Make composing two sequence-field changesets sub-linear in the common case where large,
  contiguous stretches of one changeset don't interact with the other at all.
- Do this without touching, forking, or re-implementing the actual merge semantics
  (`composeMarks`/`handleNodeChanges`/`withUpdatedEndpoint`/etc.) — reuse them verbatim so any
  correctness fix to the real implementation keeps applying.
- Keep the new data structure itself generic (not `Mark`-specific), so it's a reusable building
  block rather than a one-off.
- Validate the complexity claim empirically, not just argue for it — see
  [Complexity validation approach](#complexity-validation-approach).

## Background: why compose is linear today

`compose()` (`compose.ts`) delegates to `composeMarkLists`, which drives a `ComposeQueue` over the
two input `Mark[]` arrays. `ComposeQueue.pop()` looks at the current head mark on each side and
decides one of three things per step: consume one mark from `base` alone (`dequeueBase`), consume
one from `new` alone (`dequeueNew`), or consume a matched pair from both and merge them
(`dequeueBoth`). Regardless of which branch fires, the loop advances by at most one mark's worth of
cells at a time — so even a mark that turns out to have no effect at all (e.g. one side is a
1,000,000-cell no-op) is still visited, sliced, and copied into the output one small mark at a time
if the other side has many small marks aligned against it.

## The core idea: `MarkTree`

### API

```ts
interface Counted {
  readonly count: number;
}

interface MarkTree<T extends Counted> {
  readonly totalCount: number; // sum of count over every entry
  readonly entryCount: number; // number of entries (diagnostic)
  readonly height: number; // diagnostic; should track log(entryCount)

  atOffset(offset: number): { entry: T; offsetInEntry: number };
  splitAt(offset: number): [MarkTree<T>, MarkTree<T>];
  concat(other: MarkTree<T>): MarkTree<T>;
  toArray(): T[];
}

function markTreeFromArray<T extends Counted>(
  entries: readonly T[],
  splitEntry: (entry: T, offsetInEntry: number) => [T, T],
  mergeEntries: (left: T, right: T) => T | undefined,
  maxNodeSize?: number,
): MarkTree<T>;
```

`MarkTree<T>` is a persistent, immutable, ordered sequence of `T`, indexed by cumulative `count`
rather than by array index — an order-statistics tree, in the same family as a Fenwick tree or
segment tree, but supporting `O(log n)` split and concatenation rather than just point updates and
range sums.

### Design choices

**Forked from, not built on, the existing keyed B-tree.** `ChangeAtomIdBTree`/`RangeMap` (used by
`CrossFieldManager` today) are backed by `@tylerbu/sorted-btree-es6`, a key-comparator-based B-tree.
`MarkTree` reuses that library's _persistence and rebalancing strategy_ — copy-on-write via an
`isShared` flag plus `clone()`, node split/merge thresholds, the `splitOffRightSide`/
`takeFromLeft`/`takeFromRight`/`mergeSibling` rebalancing shape — but forks the node shape rather
than subclassing it, because every operation that relies on "binary search by comparator over an
explicit sortable key" had to be replaced with "descend by cached subtree cell-count." Marks have no
stable position key: a mark's index in the document is always _derived_ from walking from the start,
never stored, because it goes stale on every earlier insert or remove. This is the central reason a
key-indexed structure can't be reused as-is for this problem.

**Count-indexed, not key-indexed.** Every node (leaf or internal) caches `totalCount`/`entryCount`
(and `height`, needed only for concatenation — see below), recomputed bottom-up on construction.
Locating the entry at a given offset (`atOffset`) descends by comparing the target offset against
cached child `totalCount`s, the same shape as `BNode.indexOf`'s binary search, just comparing
cumulative counts instead of calling a key comparator.

**Concatenation (`concat`/`join`) has no analogue in the keyed B-tree at all** — a keyed structure's
keys impose a global order, so "concatenate two maps" isn't a meaningful operation there. This is
implemented via `join`, borrowing its shape from how balanced search trees (2-3 trees,
weight-balanced trees, ropes) classically join two same-kind trees: descend the taller side's spine
until both subtrees being glued have equal height, combine directly (splitting on overflow, the same
way `BNodeInternal.set`'s overflow handling works), and propagate any overflow back up the spine.
Only the `O(|height(left) − height(right)|)` nodes on that spine are visited or reconstructed; every
sibling not on the spine is reused by reference. This is what keeps `concat` — and by extension the
whole bulk-skip optimization below — at `O(log n)` instead of the `O(n)` flatten-and-rebuild an
earlier version of this prototype did.

**Generic, not `Mark`-specific.** `MarkTree<T extends Counted>` only requires `T` to have a `count`;
the sequence-field-specific pieces (`splitMark`, and a no-op `mergeEntries`) are supplied by the
caller. This was a deliberate choice to keep the data structure independently testable and reusable,
at the cost of not baking in any mark-specific optimizations (see
[Deviation from the original design](#deviation-from-the-original-design) for what this cost us).

## `composeMarkTrees`: the algorithm

`composeMarkTrees(baseTree, newTree, composeChild, moveEffects, revisionMetadata, maxNodeSize?)`
mirrors `ComposeQueue.pop()`'s branch structure almost exactly:

- If both sides currently reference an empty cell (`areOutputCellsEmpty(baseMark) &&
areInputCellsEmpty(newMark)`), compare cell order via `compareCellPositionsUsingTombstones` (the same
  tombstone/lineage comparison the real algorithm uses, backed by the same `cellSourcesFromMarks`
  computation) and either merge, or advance one side alone.
- If only `base`'s cell is empty, or only `new`'s is, advance that side alone, one mark at a time —
  same as `ComposeQueue.dequeueBase`/`dequeueNew`.
- Otherwise (neither side empties/fills a cell — the "genuinely interacting" regime), **this is
  where the optimization lives**.

### The bulk-skip optimization

In that last regime, if one side's current mark is a plain no-op (`{count: N}`, no `cellId`, no
`changes`), the other side's next `N` cells can potentially be reused by reference wholesale,
instead of merging one mark at a time. The implementation:

1. Determines how much of the _other_ tree is safe to reuse — capped by the no-op's own length, and
   by the nearest point where the real per-mark algorithm would have been forced to switch branches
   or otherwise treat the mark specially (see [Correctness pitfalls](#correctness-pitfalls-found)
   below for what "specially" means in practice). That cap is computed once per compose call via a
   single left-to-right pass building a sorted array of "boundary start offsets"
   (`findBoundaryStarts`), then queried per bulk-skip attempt via binary search
   (`firstBoundaryAtOrAfter`).
2. Splits both trees at the resulting length via `MarkTree.splitAt` (`O(log n)` each).
3. Splices the reused piece directly into the output tree via `MarkTree.concat` (`O(log n)`), and
   discards the no-op side's consumed portion (composing anything against a no-op is defined to just
   be that other thing, so the no-op side contributes nothing to the output).

Every mark pair that doesn't qualify for this — including every "genuinely interacting" pair, and
every solo `dequeueBase`/`dequeueNew` step — is still routed through the real, unmodified
`composeMarks` (exported from `compose.ts` for this purpose), via a synthetic no-op partner built
with the real `createNoopMark`, exactly mirroring what `ComposeQueue.dequeueBase`/`dequeueNew`
already do internally. This was a deliberate, load-bearing choice: it means the prototype's own code
only has to get the _alignment_ logic right; every actual merge decision is exactly as correct as
production code, because it _is_ production code.

### Why this is safe: the branch-by-branch argument

Tracing every mark type's `areOutputCellsEmpty`/`areInputCellsEmpty` definitions shows that a mark
reaching the "genuinely interacting" regime is restricted to a small set: a plain no-op/`Modify`, an
`Insert` (as `baseMark` only), a `MoveIn` (as `baseMark` only), or symmetrically a `Remove`/`MoveOut`
(as `newMark` only) — `Insert`/`MoveIn`/`Rename`/`AttachAndDetach` always target an empty input cell
by definition (attaches), and `Remove`/`Rename`/`MoveOut`/`AttachAndDetach` always leave their output
cell empty by definition (detaches), so both kinds are diverted to the solo-advance branches before
ever reaching here — except for one exception described below. Composing a plain no-op against any
mark of these remaining kinds, once both are settled, always yields that other mark's settled form
unchanged, which is exactly what reusing it by reference produces.

## Correctness pitfalls found

Several non-obvious correctness issues were found only by cross-checking output against the real
`compose()` mark-by-mark on the existing `cases` test matrix, not by reasoning alone. Each of these
represents a real bug that was caught and fixed during development, and each is a useful lesson
about how subtle this problem is:

- **"Pin" marks break the mark-type argument above.** A pin (`createPinMark`'s shape: `type:
"Insert"` but _no_ `cellId` — used to re-affirm content that's already visible) is the one
  attach-shaped mark whose input is _not_ considered empty, so it can reach the "genuinely
  interacting" regime on either side, not just as `baseMark`. It only becomes an actual no-op after
  `settleMark` is applied — meaning it cannot be safely bulk-copied by reference in its raw form, nor
  can it safely trigger the bulk-skip fast path itself before settling. It has to be treated as a
  hard boundary, just like a genuine attach/detach.
- **Move-related marks (`MoveIn`/`MoveOut`/`AttachAndDetach`) can carry or consume cross-field
  bookkeeping** (move-chain endpoint collapsing via `withUpdatedEndpoint`, and partial-length
  registrations via `getFirstMoveEffectLength`) that reusing them by reference would silently skip.
  These are excluded from ever being bulk-copied, regardless of which side or position they appear
  at — the prototype always falls back to the real per-mark path for anything move-related. This is
  the most significant intentionally-conservative choice in the whole design; see
  [Remaining work](#remaining-work--open-items).
- **`ComposeQueue`'s solo dequeue paths are not actually "solo" internally.**
  `ComposeQueue.dequeueBase`/`dequeueNew` always synthesize a matching no-op partner and route
  through the same `composeMarks`/`handleNodeChanges` path as a genuine pair — meaning `settleMark`
  and stashed cross-field node-change composition apply even when one side has "nothing" on the other
  side. An initial version of this prototype that hand-reconstructed this behavior via a more direct
  path missed this and produced structurally different (though semantically similar) output.
- **Trailing no-op trimming.** The real system's documented "ignore unchanged full cells at the end
  of the sequence" optimization (a changeset never carries a mark for a wholly-unaffected suffix)
  had to be explicitly replicated as a post-processing step; it doesn't fall out of the algorithm
  automatically.
- **Test-harness pitfalls, not implementation bugs, but worth flagging:** the existing
  `testCompose`/`composeNoVerify` helpers chain compositions through an initial empty accumulator
  (`compose(compose([], change1), change2)`), which is _not_ equivalent to a direct two-argument
  `compose(change1, change2)` call for cross-checking purposes — the chained version settles
  `change1` before it ever reaches `change2`. The cross-check test suite calls `compose()` directly
  for this reason.

## Deviation from the original design

AB#82432's design sketch proposed a single, self-balancing segment tree where every interior node
caches, from the start:

- the sum of children's lengths in _both_ input and output context (to answer "find the mark for a
  given cell index" efficiently in either context), and
- (via `RangeMap`) the set of all ID ranges — cell IDs and detach/root IDs — contained in its
  children (to answer "find the mark for a given ID" efficiently).

What was actually built deviates from that in two material ways:

1. **No context-aware length sums.** `MarkTree` caches only a single, context-agnostic `totalCount`.
   The "which context, and how far can I bulk-skip before hitting something unsafe" questions are
   instead answered by a separate, one-time `O(n)` array-building pass per compose call
   (`findBoundaryStarts`) plus binary search, rather than by per-node cached sums baked into the tree
   itself.
2. **No ID-range indexing at all.** There is no `RangeMap`-backed, per-node ID index anywhere in this
   prototype. Cell-order comparison for the "both sides reference an empty cell" branch reuses the
   _existing_ `cellSourcesFromMarks` mechanism (a coarse `Set<RevisionTag>` of "which revisions are
   referenced at all," computed fresh per compose call, exactly as `ComposeQueue`'s own constructor
   already does today) rather than a tree-native point-lookup structure.

**Why we deviated:** the goal for this first pass was to de-risk the core, previously-unvalidated
claim — that a persistent counted tree can make the common "big no-op aligned with many small
marks" case sub-linear — with the smallest structure that could prove it, rather than committing to
the full segment-tree-plus-RangeMap design before that core claim was even confirmed to work. Even
the minimal version required several rounds of real bug-fixing to get right (see above); folding in
context-aware sums and a whole second ID-indexed structure at the same time would have multiplied
the surface area for bugs before the foundational mechanism was proven out at all. It also turned
out, empirically, that the conservative "treat every move-related mark as a hard boundary, always
fall back to the real per-mark path" rule is _sufficient_ for full correctness without any ID-range
lookup — so building that structure speculatively, before confirming it was actually necessary,
would have been front-loaded, unvalidated complexity. The trade-off is real, though: the current
design cannot bulk-skip _through_ a run containing a move, even when doing so would in principle be
safe, which the original design's proactive `CrossFieldManager`-patching approach was aiming to
unlock.

_A follow-up iteration exploring a generalized, pluggable per-node summary (closer in spirit to the
original design's cached sums, but built as a reusable mechanism rather than hardcoded contexts) has
been sketched and stashed, but is intentionally out of scope for this document, which describes the
state being presented._

## Testing and validation

- `markTree.test.ts` (30 tests): correctness of `atOffset`/`splitAt`/`concat`/`toArray` in isolation,
  plus complexity proofs.
- `composeMarkTrees.test.ts`: cross-checks `composeMarkTrees` against the real `compose()` across
  every pair in the existing `cases` matrix used by `compose.test.ts`'s own associativity tests (144
  combinations covering insert/remove/modify/revive/pin/rename/move/moveAndRemove/return/
  transient_insert and every pairing of two of those), plus two complexity-specific tests and two
  move-specific tests.
- No regressions: the full pre-existing `SequenceField` suite (3585 tests) passes unmodified.

## Complexity validation approach

Rather than rely on wall-clock timing (noisy, environment-dependent, and easy to fool with JIT
warm-up effects), complexity claims are validated by counting actual node allocations
(`nodeConstructionStats`, test-only instrumentation incrementing a counter in every `Leaf`/`Internal`
constructor). A test composes a large no-op against thousands of small marks and asserts the node
construction count stays under a small constant, and a second test checks that construction count
grows sub-linearly (not proportionally) as the aligned run grows from 500 to 50,000 marks. This is a
much more direct proxy for the `O(log n)` claim than timing, since it counts the exact quantity the
argument is about.

## Integration plan (and why it's not done)

`compose` is one of six operations — `compose`, `invert`, `rebase`, `prune`, `replaceRevisions`,
`filterEdits` — that all share a single `Changeset` (`Mark[]`) type via the `FieldChangeRebaser<TChangeset>`
interface (`sequenceFieldChangeRebaser.ts`). `Changeset` also flows through three wire-format
codec versions, `sequenceFieldToDelta`, `relevantRemovedRoots`, and the `sequenceFieldEditor` API
that actually builds changesets. This means `composeMarkTrees` cannot be a drop-in replacement for
`compose` without a real integration decision between two paths:

- **A boundary wrapper**, converting `Mark[]` → `MarkTree` → run the algorithm → `MarkTree` →
  `Mark[]` at the `compose` call site alone. Safe and mechanical, but the conversion cost is paid on
  every call, and — since `ModularChangeFamily.compose`'s N-way squash (`balancedReduce`) is already
  a balanced, tree-shaped reduction over the input changesets — flattening back to an array between
  every level of that reduction means paying full conversion cost at _every_ level, which mostly
  cancels out the asymptotic win this prototype demonstrates in isolation.
- **Making `MarkTree` the actual persistent representation**, threaded through the other five
  operations, the codecs, and the editor as well. This is where the complexity win actually
  compounds across an N-way compose's `O(log N)` levels, but is a substantially larger effort —
  comparable in scope to this compose-only effort, repeated for each of the other operations — and a
  real architectural decision for the team, not a small follow-up.

`rebase` — the operation that originally motivated this whole investigation — has **no** `MarkTree`
equivalent built at all yet; this prototype is scoped to `compose` only.

## Remaining work / open items

- **Rebase.** Not attempted. A `MarkTree`-based rebase would need its own alignment logic (a
  `RebaseQueue` analogue) and has not been designed.
- **Bulk-skip through move-containing runs.** Currently impossible by design — every move-related
  mark is a hard boundary. Unlocking this would require the original design's proactive
  `CrossFieldManager`-patching approach (a coalesced "list all pending ranges" query plus an
  ID-indexed lookup to find and patch affected marks before bulk-skipping), which was explicitly
  deferred (see [Deviation](#deviation-from-the-original-design)) and would need its own correctness
  proof — in particular, some of the cross-field bookkeeping channels involved read _live_, mutually
  recursive state rather than statically-known values, and it isn't yet confirmed that a
  precompute-then-apply pass is safe for all of them.
- **No ID/cell-ID indexed lookup structure.** Not built; not currently blocking correctness, but a
  prerequisite for the item above.
- **Tombstone pruning.** Not attempted, matching the real `compose.ts`'s own "implementation is
  incomplete" disclaimer for the same feature.
- **The "transaction squashing" edge case** in the real `ComposeQueue.pop()` is not replicated.
- **Tuning.** `maxNodeSize` (32) is an untuned guess; there's no small-changeset fast path, so very
  small changesets likely carry tree overhead versus a bare array with no offsetting benefit.
- **Testing depth.** Coverage is a fixed pairwise matrix plus a few targeted complexity/move tests —
  not 3-way associativity chains, not the existing `composeVsIndividual.fuzz.spec.ts` fuzz harness,
  and not exercised end-to-end through the real `ModularChangeFamily`/`EditManager` stack (only at
  the `Changeset`-to-`Changeset` unit level, with a test stand-in for `composeChild`).
- **The real fixed-point invalidation loop.** `ModularChangeFamily.compose`'s
  `composeInvalidatedElements` re-processes invalidated fields in a `while` loop until it stabilizes;
  this prototype's own test harness only retries once on invalidation, which is sufficient for the
  test matrix used but not a general substitute for the real loop.
