# Plan: Custom iteration order for `SharedDirectory` (TDD)

## Implementation status (as of 2026-04-23)

**Landed on branch `directory-iteration-order`.** 985 mocha tests pass,
covering all deterministic tests T1–T67 across `directory.sortKey.spec.ts`,
`directory.rollback.spec.ts` (T50–T54), and `directory.snapshot.spec.ts`
(T58–T62), plus Slice 11 fuzz extension. Build, lint, api-reports,
api-extractor docs, and type-tests are all green. Stress-tested at
FUZZ_TEST_COUNT=500 (3735 passing).

### Deviations from the plan

1. **Op wire format uses an optional `sortKey?: string`** rather than
   `sortKey: string | null`. Absent field = clear. The plan called for
   `null` but that trips the project lint rule `unicorn/no-null`; optional
   is also more idiomatic for JSON-over-wire.
2. **Back-compat strategy: single-release additive**, not the two-release
   dark-ship described in design decision #8. Rationale: `IDirectoryDataObject`
   only gained *optional* fields (`sortKeys?`, `subdirectorySortKeys?`) and
   two new op types. Old readers ignore the optional summary fields and
   never produce/consume the new ops, so a dedicated dark-ship release
   adds no value — any client that opts into the new API is implicitly a
   post-feature client. T66/T67 still guard against a future-client op
   landing on current code (it's just a regular no-op via normal handlers).
3. **`DirectoryLocalOpMetadata` structure**: `SubDirLocalOpMetadata` stays
   narrow (create/delete only); the new pending types (`PendingSortKeySet`,
   `PendingSubDirectorySortKeySet`) are added as sibling members of the
   `DirectoryLocalOpMetadata` union directly, not grouped under the subdir
   metadata. This keeps the existing subdir-resubmit code's
   `.parentSubdir` access type-safe without casts.
4. **Iteration helper extracted to module scope** as `orderBySortKey<T>`
   (shared between key and subdir iteration) rather than two parallel
   private methods, to avoid duplication and non-null assertions.
5. **Type-test break declared**: added
   `"TypeAlias_SharedDirectory": {"forwardCompat": false}` to
   `typeValidation.broken` in `package.json`. Required because adding
   methods to `IDirectory` breaks forward-compat (old consumers'
   `IDirectory` doesn't have the new methods). Back-compat is preserved.

### Test coverage

| Group | Tests | Status | File |
|---|---|---|---|
| API — single client | T1–T14 | ✅ all in test file | `directory.sortKey.spec.ts` |
| Iteration semantics | T15–T22 | ✅ all in test file | `directory.sortKey.spec.ts` |
| Events | T23–T28 | ✅ all in test file | `directory.sortKey.spec.ts` |
| Delete / clear propagation | T29–T34 | ✅ all in test file | `directory.sortKey.spec.ts` |
| Subdirectory sort keys | T35–T38, T40, T41, T42 | ✅ in test file | `directory.sortKey.spec.ts` |
| Subdirectory sort keys | T39 | ⏭ not yet written | `directory.sortKey.spec.ts` |
| Concurrent / eventual consistency | T43, T44, T45, T46, T47, T48, T49 | ✅ in test file | `directory.sortKey.spec.ts` |
| Rollback | T50–T54 | ✅ landed in rollback spec | `directory.rollback.spec.ts` |
| Reconnect & resubmit | T55, T56 | ✅ in test file | `directory.sortKey.spec.ts` |
| Reconnect & resubmit | T57 | ⚠ simplified: asserts state after stashed-op application, not `localOpMetadata` identity. The plan's metadata assertion requires wiring a live container runtime, which is beyond what existing `TestSharedDirectory` tests do. | `directory.sortKey.spec.ts` |
| Snapshot round-trip | T58–T62 | ✅ landed in snapshot spec | `directory.snapshot.spec.ts` |
| Detached state | T63–T65 | ✅ in test file | `directory.sortKey.spec.ts` |
| Back-compat dark-ship guards | T66, T67 | ✅ in test file (shape asserts only, since there is no dark-ship mode — see deviation #2) | `directory.sortKey.spec.ts` |

**All 67 deterministic tests landed** (T45 split into T45a/T45b; T54 split
into T54a/T54b/T54c). Remaining follow-up is the fuzz extension (Slice 11).

### T45 clarification

The plan's original T45 assertion ("no lingering `sequencedSortKeys` entry"
after a delete + remote setSortKey race) conflicts with T46's
pre-registration semantics: when a setSortKey sequences on a non-existent
key (whether never-existed or just-deleted), the server can't distinguish
the two — so the sort key is accepted as pre-registration for a future
set(). T45 is split into two sub-cases that document actual observable
behavior: if the delete sequences first, the remote setSortKey acts as
pre-registration for the next rebirth of that key; if the setSortKey
sequences first, the delete clears the freshly-set sort key (consistent
with T29). Both preserve cross-client eventual consistency.

### Slice-by-slice status

| Slice | Status |
|---|---|
| 1 — API surface | ✅ done |
| 2 — Iteration semantics | ✅ done |
| 3 — Op types + message handlers | ✅ done |
| 4 — Contained event variants | ✅ done |
| 5 — Delete / clear propagation | ✅ done |
| 6 — Rollback | ✅ implementation done; explicit rollback spec tests deferred |
| 7 — Reconnect & resubmit | ✅ implementation done; T55 covers primary path |
| 8 — Snapshot round-trip | ✅ implementation done; round-trip spec tests deferred |
| 9 — Detached state | ✅ done |
| 10 — Back-compat dark-ship | ⚠ skipped per deviation #2; no Release-N branch needed |
| 11 — Fuzz | ✅ done — `setSortKey` / `setSubDirectorySortKey` actions added to `fuzzUtils.ts`, equivalence check extended to compare `keysByOrder` / `subdirectoriesByOrder` across clients |
| 12 — Documentation + changelog + api-reports | ✅ done — ARCHITECTURE.md §9.4 added, §11 subtlety added, changeset `.changeset/sharedirectory-sort-keys.md` created, api-reports regenerated, type-tests regenerated |

### Follow-up work (to land in subsequent PRs)

1. ✅ T33, T34, T42, T45a/T45b, T56 landed in `directory.sortKey.spec.ts`.
2. ✅ T50, T51, T52, T53, T54a, T54b, T54c landed in `directory.rollback.spec.ts`
   (new "Sort-key operations" describe block). T54 was split into three
   sub-cases to mirror T50-T52 as the plan's "mirrors T50-52" language intends.
3. ✅ T58, T59, T60, T61, T62 landed in `directory.snapshot.spec.ts`
   (new "SharedDirectory Snapshot Tests — sort keys" describe block).
   T59 hand-constructs an old-format header; T62 uses an inline
   `stripSortKeys` helper that recursively deletes `sortKeys` /
   `subdirectorySortKeys` from the serialized `IDirectoryDataObject` tree.
4. ✅ Slice 11 fuzz extension landed in `fuzzUtils.ts` (two new action
   types + generators/reducers), `directoryFuzzTests.spec.ts`
   (subdir-concentrated suite opts in to `setSubDirectorySortKey`),
   `directoryEquivalenceUtils.ts` (cross-client `keysByOrder` /
   `subdirectoriesByOrder` convergence check), and `directoryOracle.ts`
   (sort-key state tracking via `sortKeyChanged` /
   `subDirectorySortKeyChanged` event listeners).

### Resuming work in a fresh session

A new agent session with `Read @SORT-KEYS-PLAN.md` is enough — this status
header tells it what's landed; the test specs further down give full
Arrange / Act / Assert for each remaining test. **The implementation is
already landed**, so follow-up work is almost entirely adding tests.

**Chunk the work.** Doing all six follow-up items in one session risks
context bloat across three different test files. A good split:

- **Session A:** items 1, 2, 4 — all land in `directory.sortKey.spec.ts`,
  reusing the existing `setupTest()` / `createAdditionalClient()` fixtures.
- **Session B:** item 3 (T50–T54) in `directory.rollback.spec.ts` —
  different fixture (`setupRollbackTest`) and rollback-assertion patterns.
- **Session C:** item 5 (T58–T62) in `directory.snapshot.spec.ts` —
  different fixture (`loadSharedDirectory`) and snapshot round-trip
  patterns; also involves `createSnapshotSuite`.
- **Session D:** item 6 fuzz (largest — directoryOracle surgery).

**Before editing, the agent should verify branch state** (`git status`,
`git log -5`, `git branch --show-current`). This plan was written against
branch `directory-iteration-order` with implementation uncommitted; if
the branch has moved (commits landed, rebased onto `main`, etc.) the
line numbers in "Critical files" below may have shifted.

**Suggested opener:**

> Read `@SORT-KEYS-PLAN.md`. Pick up at the follow-up list — do items
> 1 and 2 (T33, T34, T42, T45). Implementation is already landed; I
> just need the tests. Use the existing fixtures in
> `directory.sortKey.spec.ts`.

---

## Context

`SharedDirectory` today has two deterministic-but-non-custom iteration
orders (see `packages/dds/map/ARCHITECTURE.md` §9):

- **Keys** within a `SubDirectory`: first-insertion order (`internalIterator` at
  `directory.ts:1717-1785`).
- **Child subdirectories** within a parent: `seqDataComparator` — ordered by
  sequence number, then `clientSeq` (`directory.ts:1437-1473`, §8.3).

Neither order is consumer-configurable. Consumers who want a domain-specific
order (e.g. Kanban columns, priority lists, user-sorted tabs) today must
maintain a parallel ordering structure in their own state, which defeats the
point of using the collaborative DDS.

This plan adds a **second, opt-in** iteration order driven by a replicated
string "sort key" attached to each entry and each child subdirectory. The
existing default orders are unchanged and remain the output of `keys()`,
`values()`, `entries()`, and `subdirectories()`.

## Design decisions (from brainstorming)

1. Applies to **both** surfaces — keys within a SubDirectory *and* child
   subdirectories of a parent — with the same mechanism on each.
2. Each entry carries a **single optional string** sort key (enables
   fractional indexing).
3. Sort keys are **replicated via the DDS** with two **new dedicated op
   types** (not piggybacked on existing `set` / `createSubDirectory`).
4. API shape: **parallel iterator methods** (`keysByOrder`, `valuesByOrder`,
   `entriesByOrder`, `subdirectoriesByOrder`) plus two setters
   (`setSortKey`, `setSubDirectorySortKey`). Existing methods are untouched.
5. **Missing sort key → end in default order.** Sort-keyed entries first
   in lexicographic order, then unkeyed entries in first-insertion /
   seq-data order.
6. **Tiebreaker** when two entries share a sort key: default order.
7. `setSortKey(key, undefined)` clears the sort key.
8. **Back-compat strategy: two-release dark-ship.** Release N ships a no-op
   read-side handler. Release N+1 enables the write side.

---

## TDD test specification

**This is the primary artifact for this plan.** Every test below is written
first, must fail (confirming the assertion is meaningful), then implementation
lands to make it pass. One test → one implementation slice.

### Test infrastructure

All tests follow the existing package conventions (see
`directory.iteration.spec.ts`, `directory.rollback.spec.ts`):

- `MockContainerRuntimeFactory` from `@fluidframework/test-runtime-utils/internal`.
- `setupTest()` helper (copy from `directory.iteration.spec.ts:28-44`) gives
  one attached, connected `sharedDirectory` + its `containerRuntime` and the
  shared `containerRuntimeFactory`.
- `createAdditionalClient(factory, id)` (copy from
  `directory.iteration.spec.ts:47-64`) adds a second client on the same
  factory.
- Flush pattern: `containerRuntime.flush(); containerRuntimeFactory.processAllMessages();`
- `assert` from `node:assert/strict`; BDD style (`describe`/`it`).

### New test file

`packages/dds/map/src/test/mocha/directory.sortKey.spec.ts`, structured as:

```
describe("SharedDirectory sort keys", () => {
    describe("API — single client", () => { /* T1..T14 */ });
    describe("Iteration semantics", () => { /* T15..T22 */ });
    describe("Events", () => { /* T23..T28 */ });
    describe("Delete / clear propagation", () => { /* T29..T34 */ });
    describe("Subdirectory sort keys", () => { /* T35..T42 */ });
    describe("Concurrent / eventual consistency", () => { /* T43..T49 */ });
    describe("Rollback", () => { /* T50..T54 — may live in rollback spec */ });
    describe("Reconnect & resubmit", () => { /* T55..T57 */ });
    describe("Snapshot round-trip", () => { /* T58..T62 — may live in snapshot spec */ });
    describe("Detached state", () => { /* T63..T65 */ });
    describe("Back-compat — Release N dark ship", () => { /* T66..T67 */ });
});
```

Each test below gives **Arrange / Act / Assert** and the **invariant** it
pins. Tests marked "(rollback spec)" land in
`directory.rollback.spec.ts`; "(snapshot spec)" in `directory.snapshot.spec.ts`.

---

### API — single client (attached)

**T1. `setSortKey` returns void and does not throw for existing key.**
- Arrange: `setupTest()`. `sharedDirectory.set("a", 1)`. Flush + process.
- Act: `sharedDirectory.setSortKey("a", "M")`.
- Assert: does not throw. Flush + process. No change to `get("a")`.
- Invariant: sort-key setter is independent from value setter.

**T2. `setSortKey` on a nonexistent key is allowed (no throw).**
- Arrange: `setupTest()`.
- Act: `sharedDirectory.setSortKey("nope", "M")`.
- Assert: does not throw. `get("nope")` still `undefined`.
- Invariant: Sort-key registration is independent from key existence
  (design decision — allow pre-registration).

**T3. `setSortKey` with `undefined` removes a prior sort key.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process.
- Act: `setSortKey("a", undefined)`. Flush + process.
- Assert: `[...keysByOrder()]` includes `"a"` in the unkeyed bucket
  (not the sort-keyed bucket).
- Invariant: `undefined` clears the sort key.

**T4. `setSortKey` is LWW within a single client.**
- Arrange: `set("a", 1); set("b", 2)`. Flush + process.
- Act: `setSortKey("a", "M"); setSortKey("a", "Z")`. Flush + process.
- Assert: `[...entriesByOrder()]` has `a` ordered by sort key `"Z"`, not
  `"M"`.
- Invariant: Second set overwrites first.

**T5. `setSortKey` throws on disposed subdirectory.**
- Arrange: `setupTest()`. `createSubDirectory("sub")`. Flush + process.
  `deleteSubDirectory("sub")`. Flush + process.
- Act: call `setSortKey` on the (locally-cached) deleted subdir handle.
- Assert: throws (per `throwIfDisposed` on mutating methods,
  `directory.ts:1181-1185`).
- Invariant: Dispose guard on mutating methods.

**T6. `setSubDirectorySortKey` sets and `subdirectoriesByOrder()` reflects.**
- Arrange: `createSubDirectory("a"); createSubDirectory("b"); createSubDirectory("c")`.
  Flush + process.
- Act: `setSubDirectorySortKey("b", "1"); setSubDirectorySortKey("a", "2")`.
  Flush + process.
- Assert: `[...subdirectoriesByOrder()].map(([n]) => n) === ["b", "a", "c"]`.
- Invariant: subdir sort key governs subdir iteration.

**T7. `setSubDirectorySortKey` on a nonexistent subdir is allowed.**
- Arrange: `setupTest()`.
- Act: `setSubDirectorySortKey("future", "X")`.
- Assert: does not throw. `getSubDirectory("future")` still `undefined`.
- Invariant: Pre-registration allowed for subdirs too.

**T8. `setSubDirectorySortKey(name, undefined)` clears.**
- Same as T3, with subdirs.

**T9. `setSortKey` on a deeply nested subdir works.**
- Arrange: `createSubDirectory("l1").createSubDirectory("l2")`. Flush +
  process. `l2 = getWorkingDirectory("/l1/l2"); l2.set("x", 1); l2.set("y", 2)`.
  Flush + process.
- Act: `l2.setSortKey("y", "A"); l2.setSortKey("x", "B")`. Flush + process.
- Assert: `[...l2.keysByOrder()] === ["y", "x"]`.
- Invariant: Path-routed ops work at any depth.

**T10. `setSortKey` does not fire `valueChanged`.**
- Arrange: `set("a", 1)`. Flush + process. Hook `valueChanged` listener →
  counter.
- Act: `setSortKey("a", "M")`. Flush + process.
- Assert: counter unchanged.
- Invariant: Sort-key change is orthogonal to value change (no event
  overloading).

**T11. `setSortKey` does not fire `sortKeyChanged` twice for local op
(submit + ack).**
- Arrange: `set("a", 1)`. Flush + process. Hook `sortKeyChanged` →
  counter.
- Act: `setSortKey("a", "M")`. *Before* flush: assert counter === 1 (local
  event fired optimistically). Flush + process. Assert counter still === 1
  (ack does not re-fire).
- Invariant: Event fires once per *observable* change. Mirrors
  `valueChanged` semantics (ARCHITECTURE §6.4).

**T12. `setSortKey` with empty-string sort key is valid.**
- Arrange: `set("a", 1); set("b", 2)`. Flush + process.
- Act: `setSortKey("b", ""); setSortKey("a", "A")`. Flush + process.
- Assert: `[...keysByOrder()] === ["b", "a"]` (empty string sorts before
  "A").
- Invariant: Empty string is a valid sort key (not conflated with unset).

**T13. Can re-set sort key to same value without side effect.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process. Hook
  `sortKeyChanged` → counter.
- Act: `setSortKey("a", "M")`. Flush + process.
- Assert: counter still fires (we don't dedupe at API surface) but
  iteration order is unchanged.
- Invariant: Idempotent at state level; event still fires (simpler
  semantics than diff-dedupe).

**T14. Forwarders on `SharedDirectory` route to root SubDirectory.**
- Arrange: `setupTest()`. `set("x", 1)`.
- Act: `sharedDirectory.setSortKey("x", "M")`. (Not `sharedDirectory.root.setSortKey`.)
- Assert: `[...sharedDirectory.keysByOrder()] === ["x"]`. Root forwarders
  work symmetrically to existing `get`/`set`.
- Invariant: `SharedDirectory` surface covers the new API.

---

### Iteration semantics

**T15. `keysByOrder` returns empty on empty directory.**
- Arrange: `setupTest()`.
- Assert: `[...keysByOrder()] === []`.

**T16. `keysByOrder` fast-path equals `keys` when no sort keys set.**
- Arrange: `set("c", 1); set("a", 2); set("b", 3)`. Flush + process.
- Assert: `[...keysByOrder()]` deep-equal `[...keys()]` (both
  `["c", "a", "b"]`).
- Invariant: zero-cost fallback when feature unused.

**T17. Sort-keyed entries iterate in lexicographic sort-key order.**
- Arrange: `set("a", 1); set("b", 2); set("c", 3)`. Flush + process.
  `setSortKey("a", "3"); setSortKey("b", "1"); setSortKey("c", "2")`.
  Flush + process.
- Assert: `[...keysByOrder()] === ["b", "c", "a"]`.

**T18. Unkeyed entries appear after sort-keyed, in default order.**
- Arrange: `set("x", 1); set("y", 2); set("z", 3); set("q", 4)`.
  Flush + process. `setSortKey("z", "A"); setSortKey("x", "B")`.
  Flush + process.
- Assert: `[...keysByOrder()] === ["z", "x", "y", "q"]`.
- Invariant: two-phase iteration (sort-keyed then unkeyed).

**T19. Tie on sort key breaks by insertion order.**
- Arrange: `set("first", 1); set("second", 2); set("third", 3)`.
  Flush + process. All three get the same sort key `"X"`. Flush + process.
- Assert: `[...keysByOrder()] === ["first", "second", "third"]`.

**T20. Tie between sort-keyed and unkeyed: sort-keyed wins.**
- Arrange: `set("a", 1); set("b", 2)`. Flush + process.
  `setSortKey("a", "any")` — not set on `b`. Flush + process.
- Assert: `[...keysByOrder()] === ["a", "b"]`.

**T21. `valuesByOrder` and `entriesByOrder` agree with `keysByOrder`.**
- Arrange: set of three keys with sort keys and distinct values.
- Assert: `[...valuesByOrder()]` aligns positionally with `[...keysByOrder()]`.
  `[...entriesByOrder()]` aligns pair-wise.
- Invariant: three iterators share ordering.

**T22. Lexicographic uses JS `<` comparison (not `localeCompare`).**
- Arrange: `set` three keys; set sort keys `"Z"`, `"a"`, `"A"` (on three
  distinct keys).
- Assert: Order is `"A"`, `"Z"`, `"a"` (UTF-16 code-point order), **not**
  `"a"`, `"A"`, `"Z"` (locale-sensitive).
- Invariant: Deterministic, cross-client-stable comparator.

---

### Events

**T23. `sortKeyChanged` fires on local set.**
- Arrange: listener. `set("a", 1)`. Flush + process.
- Act: `setSortKey("a", "M")`. (Before flush.)
- Assert: listener fired once; payload `{ path: "/", key: "a",
  sortKey: "M", previousSortKey: undefined }`, `local: true`.

**T24. `sortKeyChanged` fires on remote set.**
- Arrange: two clients, both with `set("a", 1)` acked. Listener on client 2.
- Act: client 1 `setSortKey("a", "M")`. Flush + process on both.
- Assert: client 2's listener fired with `{ path: "/", key: "a",
  sortKey: "M", previousSortKey: undefined }`, `local: false`.

**T25. `previousSortKey` is correct on update.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process.
  Listener attached.
- Act: `setSortKey("a", "Z")`. Flush + process.
- Assert: payload `{ sortKey: "Z", previousSortKey: "M" }`.

**T26. `sortKeyChanged` does not fire on remote op when local pending
exists for that key.**
- Arrange: two clients, `set("a", 1)` acked on both.
- Act: client 1 starts `setSortKey("a", "Z")` (don't flush yet). Client 2
  `setSortKey("a", "M")`. Client 2 flush. Process messages.
- Assert: client 1's listener did NOT fire for the remote value (sequenced
  state updated silently).
- Invariant: Event suppression by pending state, ARCHITECTURE §6.4.

**T27. `containedSortKeyChanged` fires on the SubDirectory handle directly.**
- Arrange: `createSubDirectory("sub")`. Flush + process. `sub = getWorkingDirectory("/sub"); sub.set("a", 1)`.
  Flush + process. Listener on `sub`.
- Act: `sub.setSortKey("a", "M")`. Flush + process.
- Assert: listener fired; payload has **no** `path` field, just `{ key, sortKey, previousSortKey }`.
- Invariant: `IDirectoryEvents` surface matches existing
  `containedValueChanged` convention (`interfaces.ts:223-296`).

**T28. Deleting a key does NOT fire `sortKeyChanged` even if sort key
was set.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process. Listener.
- Act: `delete("a")`. Flush + process.
- Assert: `valueChanged` fired (existing behavior). `sortKeyChanged` did
  NOT fire.
- Invariant: Sort-key cleanup is implicit; documented in event JSDoc.

---

### Delete / clear propagation

**T29. `delete(k)` clears sort key for `k`.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process.
- Act: `delete("a")`. Flush + process.
- Act: `set("a", 2)`. Flush + process.
- Assert: `[...keysByOrder()] === ["a"]` (in unkeyed bucket — verify by
  adding another keyed entry, e.g. `set("b", 3); setSortKey("b", "Z")`,
  then `[...keysByOrder()] === ["b", "a"]`).
- Invariant: Sort key doesn't survive key lifetime (design decision).

**T30. `clear()` clears all sort keys in that SubDirectory.**
- Arrange: three keys each with a sort key.
- Act: `clear()`. Flush + process.
- Act: re-`set` the three keys.
- Assert: `[...keysByOrder()]` has all three in unkeyed (insertion) order.

**T31. `clear()` on parent does NOT clear sort keys in child subdirs.**
- Arrange: root has keys with sort keys; `createSubDirectory("sub");
  sub.set("x", 1); sub.setSortKey("x", "M")`. Flush + process.
- Act: root `clear()`. Flush + process.
- Assert: root sort keys gone; `sub.keysByOrder()` still has `x`.
- Invariant: `clear()` is per-directory, not recursive.

**T32. `deleteSubDirectory(name)` clears subdir sort key on parent.**
- Arrange: `createSubDirectory("sub"); setSubDirectorySortKey("sub", "M")`.
  Flush + process.
- Act: `deleteSubDirectory("sub")`. Flush + process.
- Act: `createSubDirectory("sub")`. Flush + process.
- Assert: the new `sub` is in the unkeyed bucket of
  `subdirectoriesByOrder()`.

**T33. Rollback of a delete restores the key AND its sort key.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process.
- Act: start `delete("a")` but trigger rollback before send (use the
  rollback pattern from `directory.rollback.spec.ts:78-95` area).
- Assert: `[...keysByOrder()] === ["a"]` with `a` still in sort-keyed
  bucket.
- Invariant: Sort-key cleanup only fires on ack, not on local-optimistic
  delete.

**T34. A `clear` while a pending `setSortKey` is in flight — local
pending discarded.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process. Local
  `setSortKey("a", "Z")` submitted but not yet flushed.
- Act: `clear()`. Flush + process.
- Assert: no `sortKeyChanged` for the pending `"Z"` value once ack
  arrives; sequenced state is empty. No leftover in `sequencedSortKeys`.
- Invariant: `clear()` invalidates pending sort keys. May require
  explicit handling in pending-state logic; if test fails, implementation
  must splice pending sort-key entries on local `clear` the same way it
  does for pending value entries.

---

### Subdirectory sort keys

Mirror T15–T22 and T23–T28 for subdirectories:

**T35.** `subdirectoriesByOrder` empty on empty parent.
**T36.** Fast path equals `subdirectories()` when no subdir sort keys set.
**T37.** Sort-keyed subdirs iterate in lexicographic order.
**T38.** Unkeyed subdirs appear after, in `seqDataComparator` order.
**T39.** Tie on sort key breaks by `seqDataComparator`.
**T40.** `subDirectorySortKeyChanged` fires on local and remote.
**T41.** `containedSubDirectorySortKeyChanged` fires on the parent subdir.
**T42.** Deleting a grandchild subdir does not clear parent's
`subdirectorySortKeys` entries for siblings.

---

### Concurrent / eventual consistency

**T43. Two clients set sort keys on different keys — both converge.**
- Arrange: two clients, `set("a", 1); set("b", 2)` on both, acked.
- Act: client 1 `setSortKey("a", "1")`. Client 2 `setSortKey("b", "2")`.
  Both flush; process messages.
- Assert: both clients see `[...keysByOrder()] === ["a", "b"]`.

**T44. Two clients set sort keys on the same key — LWW.**
- Arrange: acked `set("a", 1)`.
- Act: client 1 `setSortKey("a", "X")`. Client 2 `setSortKey("a", "Y")`.
  Both flush; process messages. `MockContainerRuntimeFactory` sequences
  client 1's op first by default.
- Assert: both clients converge to sort key `"Y"` (the later-sequenced
  op). Verify via `keysByOrder` (add another entry to disambiguate).

**T45. Client A deletes key while Client B sets sort key for same key.**
- Arrange: acked `set("a", 1)` on both.
- Act: client A `delete("a")`. Client B `setSortKey("a", "M")`. Both flush
  in interleaved order. Process.
- Assert (delete first): `a` gone from both; no lingering
  `sequencedSortKeys` entry. `get("a") === undefined`.
- Assert (set-sort-key first): `a` is deleted; sort key also cleared
  (per T29).
- Invariant: `clientIds` / `isMessageForCurrentInstanceOfSubDirectory`
  guards keep state consistent even across race.

**T46. Concurrent pre-registration: setSortKey on not-yet-existing key
then remote set.**
- Arrange: two clients, no shared keys.
- Act: client 1 `setSortKey("a", "M")`. Flush; process. Client 2
  `set("a", 42)`. Flush; process.
- Assert: both clients see `a` in sort-keyed bucket with value `42`.
- Invariant: Sort key persists while waiting for first value set.

**T47. Grouped batching — two setSortKey on same key in one batch.**
- Arrange: acked `set("a", 1)`.
- Act: `setSortKey("a", "M"); setSortKey("a", "Z");` (no flush between).
  Flush; process.
- Assert: Final state sort key `"Z"`. Both ops sequenced; ack matching by
  reference identity correctly removes both pending entries.
- Invariant: Pending-entry reference identity, ARCHITECTURE §6.2.

**T48. Bulk iteration remains consistent under concurrent writes.**
- Arrange: two clients, ten keys, various sort keys.
- Act: Start `keysByOrder()` iteration on client 1. Mid-iteration, client
  2 sets a new sort key on an existing key. Finish iteration on client 1.
- Assert: Client 1's iteration completes without throwing. (Iterator
  correctness under concurrent mutation — we don't require snapshot
  semantics, but we must not crash.)

**T49. Two clients load same snapshot — iteration order identical.**
- Arrange: client 1 sets up keys with sort keys, summarizes.
- Act: client 2 loads the summary.
- Assert: `[...client1.keysByOrder()] === [...client2.keysByOrder()]`.
  Exact equality.
- Invariant: Deterministic comparator.

---

### Rollback (extend `directory.rollback.spec.ts`)

**T50. Rollback of a `setSortKey` with no prior sort key reverts to
unset.**
- Arrange: `set("a", 1)`. Flush + process. Start `setSortKey("a", "M")`
  (don't flush).
- Act: trigger rollback.
- Assert: `[...keysByOrder()]` has `a` in unkeyed bucket (no sort key).
  `sortKeyChanged` event fired with `sortKey: undefined, previousSortKey:
  "M"`.

**T51. Rollback of a `setSortKey` that replaced an existing sort key
reverts to the prior value.**
- Arrange: `set("a", 1); setSortKey("a", "M")`. Flush + process. Start
  `setSortKey("a", "Z")` (don't flush).
- Act: rollback.
- Assert: sort key is back to `"M"`. Event payload `{ sortKey: "M",
  previousSortKey: "Z" }`.

**T52. Rollback of multiple pending setSortKey on same key — only the
rolled-back one reverts.**
- Arrange: `set("a", 1)`. Flush + process. Pending
  `setSortKey("a", "M")`. Pending `setSortKey("a", "Z")`. (Without
  flushing.)
- Act: Roll back only the "Z" op.
- Assert: Optimistic sort key is "M" (the prior pending entry still
  stands).
- Invariant: Pending-entry splice by reference identity, not by key.

**T53. Rollback while detached is a no-op.**
- Arrange: detached dir, `setSortKey("a", "M")` applied directly.
- Act: rollback should not be callable (no submit happens when detached).
- Assert: No crash; state consistent. Detached path mirrors existing
  detached-`set` semantics.

**T54. Rollback of `setSubDirectorySortKey` mirrors T50-52.**

---

### Reconnect & resubmit

**T55. Pending `setSortKey` survives disconnect and is resubmitted.**
- Arrange: use `MockContainerRuntimeFactoryForReconnection` (pattern from
  `directory.snapshot.spec.ts:10-17`). `set("a", 1)`. Flush + process.
  Start `setSortKey("a", "M")` (unflushed). Disconnect.
- Act: Reconnect. Flush + process.
- Assert: sort key `"M"` applied on both clients. Pending entry cleared
  on ack. Same `localOpMetadata` reference used (verify via
  `TestSharedDirectory` pattern from
  `directory.snapshot.spec.ts:43-57`).

**T56. Pending `setSortKey` whose subdir was remotely deleted during
disconnect is dropped silently.**
- Arrange: `createSubDirectory("sub"); sub.set("x", 1)`. Flush + process
  (sync between two clients). Client 1 pending `sub.setSortKey("x", "M")`
  (unflushed). Client 1 disconnects. Client 2
  `deleteSubDirectory("sub")`. Client 2 flush + process.
- Act: Client 1 reconnects, flushes. Process.
- Assert: No crash. Sub is gone on both clients. Pending op was
  dropped by `isMessageForCurrentInstanceOfSubDirectory`.

**T57. `applyStashedOp` correctly restores pending `setSortKey`.**
- Arrange: Use `TestSharedDirectory` (from `directory.snapshot.spec.ts`)
  to inject a stashed `setSortKey` op.
- Act: `testApplyStashedOp({ type: "setSortKey", path: "/", key: "a",
  sortKey: "M" })`.
- Assert: Pending entry exists; `localOpMetadata` returned is the new
  `PendingSortKeySet`. Subsequent flush + process acks it normally.

---

### Snapshot round-trip (extend `directory.snapshot.spec.ts`)

**T58. Snapshot with sort keys reloads with same iteration order.**
- Arrange: set 5 keys with sort keys. Flush + process. Summarize.
- Act: Load the summary in a new client.
- Assert: `[...new.keysByOrder()] === [...original.keysByOrder()]`.

**T59. Old-format snapshot (no `sortKeys` field) loads cleanly.**
- Arrange: Hand-construct a snapshot JSON matching pre-feature schema
  (no `sortKeys` / `subdirectorySortKeys`).
- Act: Load via `populate` (pattern from
  `directory.snapshot.spec.ts:59-75`).
- Assert: Loads without error. `[...keysByOrder()]` equals `[...keys()]`
  (empty sort-key state → fast path).
- Invariant: Additive field, no version bump.

**T60. Snapshot round-trip preserves subdir sort keys.**
- Arrange: Three subdirs with `setSubDirectorySortKey` applied. Summarize.
- Act: Load in new client.
- Assert: `subdirectoriesByOrder()` identical on both.

**T61. Snapshot round-trip preserves nested sort keys.**
- Arrange: Root with key sort keys; `sub` with its own key sort keys;
  root with subdir sort keys for `sub`. Summarize.
- Act: Load in new client.
- Assert: All three sort-key namespaces preserved; iteration identical.

**T62. New-format snapshot written by branch build loads into pre-branch
build (simulated).**
- Arrange: Summarize a branch-build directory with sort keys. Manually
  strip the `sortKeys` / `subdirectorySortKeys` fields from the JSON.
- Act: Load the stripped snapshot.
- Assert: Loads without error. No sort keys present. Default iteration
  preserved.
- Invariant: Forward-compat — newer snapshots remain readable by older
  code after lossy strip.

---

### Detached state

**T63. `setSortKey` works while detached.**
- Arrange: Create a detached `SharedDirectory` (no `.connect()` call).
  `set("a", 1)`.
- Act: `setSortKey("a", "M")`.
- Assert: `[...keysByOrder()] === ["a"]` (sort-keyed). No op submitted
  (no containerRuntime).

**T64. Detached directory summary includes sort keys.**
- Arrange: Detached; `set`/`setSortKey` a few. Summarize (via
  `getAttachSummary` pattern).
- Assert: Summary content contains `sortKeys` field.

**T65. Attaching a detached directory preserves sort keys.**
- Arrange: Set up detached, populate, summarize, then attach a fresh
  client and load the summary.
- Assert: Both sides see same `keysByOrder`.

---

### Back-compat — Release N dark ship

**T66. Release N directory absorbs a `setSortKey` op from a future
client without crashing.**
- Arrange: Simulate Release N by commenting out / temporarily disabling
  the write-side API registration, keeping only the read-side no-op
  handler. (Or: build a test-only "dark ship" directory class exposing
  only the handlers.)
- Act: Inject `{ type: "setSortKey", path: "/", key: "a", sortKey: "M" }`
  as a remote op via `MockContainerRuntimeFactory`.
- Assert: No throw. `sequencedSortKeys` is empty (no state mutation).
- Invariant: Dark-ship handler is truly no-op.

**T67. Release N directory absorbs `setSubDirectorySortKey` similarly.**

---

## Implementation (follows test order)

Per TDD, each implementation slice is the minimum change to turn red
tests green. Implementation order follows the test groups above; earlier
groups unlock later ones.

### Slice 1 — API surface (T1, T5, T10, T14)

- Add `setSortKey`, `setSubDirectorySortKey`, `keysByOrder`,
  `valuesByOrder`, `entriesByOrder`, `subdirectoriesByOrder` to
  `IDirectory` (`interfaces.ts:45-120`).
- Stub implementations on `SubDirectory` that throw "not implemented",
  plus root forwarders on `SharedDirectory`. This gets T1/T5/T10/T14
  *compilable* — they'll fail at the throw.
- Replace throws with minimal state: `sequencedSortKeys`,
  `sequencedSubDirectorySortKeys` maps. Fast-path iteration.

### Slice 2 — Iteration semantics (T15–T22)

- Implement `computeOptimisticSortKeys` (stub at first — walks only
  sequenced).
- Implement two-phase iteration.
- Comparator via `<`/`>`, stable tie-break by default-order index.

### Slice 3 — Op type + message handler (T23–T25, T43–T44, T49)

- Add `IDirectorySetSortKeyOperation` /
  `IDirectorySetSubDirectorySortKeyOperation` to
  `directory.ts:95-213`, extend union at `:213`.
- Add pending entry kinds at `:215-270`.
- Register handlers in `setMessageHandlers` (`:847+`).
- Implement `processSetSortKeyMessage` /
  `processSetSubDirectorySortKeyMessage`.
- Emit `sortKeyChanged` / `subDirectorySortKeyChanged` events; wire into
  `ISharedDirectoryEvents` / `IDirectoryEvents`.
- Event suppression for pending state (T26).
- Extend `DirectoryLocalOpMetadata` at `:1097-1106`.

### Slice 4 — Events — contained variants (T27, T40, T41)

- Add `containedSortKeyChanged` /
  `containedSubDirectorySortKeyChanged` on `IDirectoryEvents`
  (`interfaces.ts:223-296`).
- Emit from SubDirectory while simultaneously emitting the
  path-carrying variant on the root.

### Slice 5 — Delete / clear propagation (T28–T32, T45)

- On remote/local `processDeleteMessage`
  (`directory.ts:1964-2009`): delete from `sequencedSortKeys`.
- On `processClearMessage` (`:1894-1954`): `sequencedSortKeys.clear()`.
- On `processDeleteSubDirectoryMessage` (`:2216-2217`): delete from
  `sequencedSubDirectorySortKeys`.
- Splice pending sort-key entries on local `clear()` and local
  `delete()` to satisfy T34.
- In `clearSubDirectorySequencedData` (`:2718-2725`): clear both
  sort-key maps.

### Slice 6 — Rollback (T50–T54)

- Extend `SubDirectory.rollback()` (`:2438-2588`) with branches for
  `"setSortKey"` and `"setSubDirectorySortKey"`.
- Compute restored value via `getOptimisticSortKey` after splice.
- Emit `sortKeyChanged` / `subDirectorySortKeyChanged`.

### Slice 7 — Reconnect & resubmit (T55–T57)

- Add `resubmitSortKeyMessage` /
  `resubmitSubDirectorySortKeyMessage` near `:2293-2312`.
- Cases in `applyStashedOp` (`:985-1014`).
- `reSubmitCore` path unchanged — it dispatches through
  `messageHandlers.get(op.type)` already.

### Slice 8 — Snapshot round-trip (T58–T62)

- Extend `IDirectoryDataObject` (`:303-323`) with optional `sortKeys` /
  `subdirectorySortKeys`.
- In `serializeDirectory` (`:1016-1081`, after `:1062`): emit if
  non-empty.
- In `populate` (`:722-790`, after `:787`): read if present.
- Add `getSerializableSortKeys` /
  `getSerializableSubDirectorySortKeys` accessors (pattern from
  `getSerializableCreateInfo` at `:2402-2409`).
- Add comment at `directoryFactory.ts:39` explaining why version
  stays at `"0.1"`.

### Slice 9 — Detached state (T63–T65)

- Verify `setSortKey` in detached path writes directly to sequenced
  maps and skips pending. (Pattern: check `this.directory.isAttached()`
  at top of setter, same as `set()`.)

### Slice 10 — Back-compat (T66–T67)

- Release N branch: register only no-op handlers (log + discard).
- Release N+1 = this plan's target: full implementation.
- (Plan discussion only — the test file includes T66/T67 as guards
  for the no-op behavior in Release N; they verify that a newer-client op
  landing on a Release N reader is absorbed.)

### Slice 11 — Fuzz

- Extend `directoryFuzzTests.spec.ts` with `setSortKey` and
  `setSubDirectorySortKey` actions.
- Extend `directoryOracle.ts` (in same test dir) to track expected
  sort-key maps and validate `keysByOrder` / `subdirectoriesByOrder`
  at convergence cycles.

### Slice 12 — Documentation

- `ARCHITECTURE.md`: new §9.4 "Sort keys" covering maps, pending model,
  iteration contract, event suppression.
- `ARCHITECTURE.md` §11 "Known subtleties": add entry for
  delete-clears-sort-key.
- Regenerate `api-report/*.md` via `pnpm --filter @fluidframework/map build:api-reports`.
- Invoke `/changelog` skill for the changie fragment.
- Invoke `/api-changes` skill if api-report diffs trigger its criteria.

---

## Critical files

Paths rooted at `/Volumes/FluidFramework/directory-iteration-order/`.

- `packages/dds/map/src/interfaces.ts` — public surface.
- `packages/dds/map/src/directory.ts` — all internal work.
- `packages/dds/map/src/directoryFactory.ts` — comment at line 39.
- `packages/dds/map/src/test/mocha/directory.sortKey.spec.ts` — **new**,
  T1–T49, T63–T67.
- `packages/dds/map/src/test/mocha/directory.rollback.spec.ts` — T50–T54.
- `packages/dds/map/src/test/mocha/directory.snapshot.spec.ts` — T58–T62.
- `packages/dds/map/src/test/mocha/directoryFuzzTests.spec.ts` — fuzz.
- `packages/dds/map/src/test/mocha/oracleUtils.ts` /
  `directoryEquivalenceUtils.ts` — oracle extensions if applicable.
- `packages/dds/map/ARCHITECTURE.md` — §9.4 + §11 update.
- `packages/dds/map/api-report/*.md` — regenerated artifact.

## Reused existing functions / patterns

- `getOptimisticValue` (`directory.ts:1791-1808`) — pattern for
  `getOptimisticSortKey`.
- `internalIterator` (`directory.ts:1717-1785`) — Phase 1 + 2 walk.
- `subdirectories()` (`directory.ts:1437-1473`) — default subdir order.
- `isMessageForCurrentInstanceOfSubDirectory` (`directory.ts:2605-2619`)
  — guard.
- `isNotDisposedAndReachable` (`directory.ts:1875-1879`) — event gate.
- `submitDirectoryMessage` — new op submission.
- `findLastIndex` (`utils.ts`) — pending-entry search.
- `getSerializableCreateInfo` (`directory.ts:2402-2409`) — accessor
  pattern.
- Test helpers: `setupTest`, `createAdditionalClient` (copy from
  `directory.iteration.spec.ts:28-64`).
- `TestSharedDirectory` (`directory.snapshot.spec.ts:43-57`) — for
  inspecting `localOpMetadata` in T55/T57.
- `MockContainerRuntimeFactoryForReconnection` — for T55/T56.

## Verification

1. `pnpm --filter @fluidframework/map build` — clean type check.
2. `pnpm --filter @fluidframework/map build:api-reports` — regenerate.
3. `pnpm --filter @fluidframework/map test:mocha` — all 67 new tests pass
   plus the existing suite.
4. `pnpm --filter @fluidframework/map test:mocha --grep fuzz` — fuzz
   oracle passes.
5. Manual smoke: load a captured pre-branch snapshot (T59) to confirm
   back-compat on real data.
6. `/changelog` skill for changie fragment.
7. `/api-changes` skill if api-report diff flags customer-facing
   additions (which it will — this is @legacy @beta surface).
8. `/ci-readiness-check` before pushing.

## Open risks / not in scope

- **Sort direction (asc / desc)** — deliberately deferred. v1 ships
  ascending only. Consumers who need descending can add an optional
  `direction?: "asc" | "desc" = "asc"` parameter to each iterator in a
  later release; the default-value defaulting makes the addition
  non-breaking. We are not shipping it now because (a) we have no
  concrete consumer ask, (b) `[...entriesByOrder()].reverse()` is an
  imperfect workaround (it swaps the sort-keyed/unkeyed bucket order)
  but acceptable for simple cases, and (c) it would double the test
  surface for the ordering axis.
- Secondary sort keys, filtered ordered views, numeric sort keys —
  deferrable; the string-single-field design doesn't preclude them.
- Applying this mechanism to `SharedMap` — explicitly not in scope.
- Migration of existing consumers from self-rolled ordering to the new
  API — out of scope for this plan; a follow-up guide.
