# SharedDirectory Insertion Ordering Hints — Implementation Plan

**Status:** Draft
**Requirements:** [`ordering-hints-requirements.md`](./ordering-hints-requirements.md)

This document covers implementation strategy. All observable behavior is defined by the requirements spec; this plan describes *how* to meet those requirements.

## 1. Options under consideration

Two paths can satisfy the requirements:

- **Option A — Feature-add on the existing `SharedDirectory` codepath.** Extend the current op, sort key, and process/resubmit flow in-place. No change to the DDS identity or persisted format version.
- **Option B — Replat `SharedDirectory` on `SharedTree` internals behind a facade.** Rebuild the subdirectory ordering and merge machinery using `SharedTree`'s sequence fields, preserving the public `IDirectory` API.

The rest of this section compares them. Subsequent sections detail Option A, which is the recommended path for this feature.

### 1.1 Option A — feature-add on current codepath

**Scope.** Localized. Touches ~4 files in `packages/dds/map/src/`: the op type, the `SequenceData` shape, the comparator, the `createSubDirectory*` methods, the process/resubmit/serialize paths, and the public interface. Roughly 1–2 weeks of engineering including tests and review.

**Pros.**
- Keeps `SharedDirectory`'s public DDS identity, snapshot format family, and op lineage unchanged.
- Mixed-version sessions degrade predictably (old clients append; new clients see the hint). No hard cut-over.
- Tests can layer directly onto the existing `directory.order.spec.ts` fixture.

**Cons.**
- Adds complexity to `SharedDirectory`'s already-intricate ordering code. The recursive/nested sort key in §3 is the main carrier of that complexity.
- Does not reduce long-term maintenance burden on the custom ordering algorithm.

### 1.2 Option B — replat on SharedTree

**Scope.** Much larger. A full reimplementation of the internal storage, ordering, and merge behavior behind the `IDirectory` API, plus a snapshot-migration story for documents persisted in the current format. Estimated multiple quarters of engineering.

**What SharedTree actually gives us** (from research against `packages/dds/tree`):
- Sequence fields support positional insertion with rigorous concurrent-edit merge semantics (`insertAt(index, ...)`, `CellOrder` merge rules).
- Rebase on reconnect is automatic; optimistic positions are re-resolved against remote state.
- Snapshot format versioning and op-codec version negotiation exist within `SharedTree`.

**What SharedTree does *not* give us that the feature needs:**
- No "insert after node X" reference-based primitive. SharedTree's insertion is index-based. We would still have to build the reference-based semantics (anchor lookup by name at stamp time, fallback on missing anchor) on top of index-based inserts.
- No native ordered-keyed-map node. We would model subdirectories as a sequence of `{name, value}` pairs.
- No precedent in this repo for replatting a DDS onto SharedTree, so the snapshot migration, op interop story, and facade layer would all be novel.
- Op format is a hard cut-over. Clients speaking legacy `SharedDirectory` ops cannot decode `SharedTree`-backed ops or vice versa. All clients in a session must upgrade together, and documents persisted in the legacy format need one-time conversion.

**Verdict.** Option B does not make this feature cheaper. The reference-based semantics still need to be built; SharedTree only handles the index-based ordering underneath. The replat is a defensible long-term strategy for `SharedDirectory` maintenance, but it should not gate shipping Word's feature. If the replat happens later, the requirements spec is the contract both implementations must satisfy.

### 1.3 Recommendation

Ship the feature via **Option A**. Treat Option B as a separate, independently-scoped initiative — if it happens, it must preserve the behavior defined in the requirements spec.

The rest of this document details Option A.

## 2. Option A — touch points

Based on the earlier code mapping of `packages/dds/map/src/directory.ts`:

| Concern | Where it lives today | What changes |
|---|---|---|
| Public API surface | `packages/dds/map/src/interfaces.ts` (`IDirectory`) | Add `createSubDirectoryOrderedAfter`. |
| Op shape | `directory.ts:166–181` (`IDirectoryCreateSubDirectoryOperation`) | Add optional `afterSubdirName?: string`. |
| Per-subdir ordering state | `directory.ts:1152` (`seqData`), `:389–392` (`SequenceData`) | Extend `SequenceData` to carry an optional `afterParent?: SequenceData` field (the stamped anchor's `SequenceData` at stamp time). |
| Sort comparator | `directory.ts:364–380` (`seqDataComparator`) | Replace flat comparator with a recursive one (see §3). |
| Local create entry point | `directory.ts:1294–1357` (`createSubDirectory`) | Add sibling method `createSubDirectoryOrderedAfter`; share most of the body; resolve local anchor and populate `afterParent` on the pending entry if present. |
| Op application | `directory.ts:2080–2168` (`processCreateSubDirectoryMessage`) | At stamp time, if op carries `afterSubdirName`, look it up in `_sequencedSubdirectories`; if found, copy its `seqData` as the new subdir's `afterParent`. If not found (anchor missing), leave `afterParent` undefined — fallback to append. |
| Resubmit | `directory.ts:2347–2369` (`resubmitSubDirectoryMessage`) | No structural change. Resubmit preserves the original op payload including `afterSubdirName`; re-resolution happens naturally at stamp time on whichever client sequences the op. |
| Snapshot serialize | `directory.ts:2402–2409` (`getSerializableCreateInfo`), `:279–289` (`ICreateInfo`) | Persist `afterParent` alongside the existing `csn`/`ccIds`. Field is optional for backward compat. |
| Snapshot load | `directory.ts:730–769` | Read optional `afterParent` when present; absent means old-format entry with no hint. |
| Pending op storage | `directory.ts:1712` (`pendingSubDirectoryData`) | `PendingSubDirectoryCreate` entries carry the local-resolved `afterParent` for optimistic ordering. |

## 3. The recursive sort key

**This is the non-obvious part.** A flat tiebreaker over `(seq, clientSeq)` with "later-stamped sorts earlier at tied seq" does **not** reproduce the requirements spec's ordering in the multi-insert case. The key must be recursive.

### 3.1 Why a flat key doesn't work

Consider Example 1 from the requirements spec: base `[A, B]`; client #1 inserts `C` after `A`; client #2 inserts `D` after `A`, stamping order {#1, #2}. Requirement: `[A, D, C, B]`.

If we "inherit A's seq" flatly onto C and D:
- A: effectiveSeq = 1 (assume A stamped at seq 1)
- B: effectiveSeq = 2
- C: effectiveSeq = 1 (inherited), trueSeq = 3
- D: effectiveSeq = 1 (inherited), trueSeq = 4

Sort ascending by effectiveSeq with "larger trueSeq sorts earlier" at ties: among `{A, C, D}` (all effectiveSeq 1), trueSeq descending gives `D (4), C (3), A (1)`. Final order: `[D, C, A, B]`. **Wrong** — the anchor `A` ends up behind its own descendants.

The issue is that A also has effectiveSeq 1 and gets caught in the inversion. The "later sorts earlier" rule only applies to *siblings inserted at the same anchor*, not to the anchor itself.

### 3.2 The rule that works

Each `SequenceData` carries an optional `afterParent`, which is a full recursive `SequenceData` pointing at the stamped anchor's own key at the moment of stamping. Comparator `cmp(X, Y)`:

1. If both `X.afterParent` and `Y.afterParent` are `undefined`: compare by `(seq, clientSeq)` as today.
2. If only one has an `afterParent`: compare the one without against the other's `afterParent` (recursively). Ties break so the one *with* an `afterParent` sorts **after** the one without — i.e., a child of X sorts immediately after X.
3. If both have an `afterParent`: compare `X.afterParent` against `Y.afterParent` recursively. If those differ, the outer comparison follows. If they are equal (same anchor), tiebreak by own `(seq, clientSeq)` **inverted** (larger `seq` sorts earlier — closer to the anchor).

### 3.3 Worked examples

**Example 1 (base `[A,B]`; +C after A, +D after A, stamped {#1,#2}):**
- A = `{seq:1}`; B = `{seq:2}`; C = `{seq:3, afterParent:{seq:1}}`; D = `{seq:4, afterParent:{seq:1}}`.
- `cmp(A,C)`: A has no parent, C does. Compare A vs C.afterParent = `{seq:1}`; equal; C sorts after A per rule 2. → A < C. ✓
- `cmp(B,C)`: B has no parent, C does. Compare B (`{seq:2}`) vs C.afterParent (`{seq:1}`); 2 > 1, so C.afterParent < B, so C < B. ✓
- `cmp(C,D)`: both have parents; both parents are `{seq:1}`, equal. Own seq: C=3, D=4; inverted, D < C. ✓
- Final order: `A, D, C, B`. ✓

**Example 4 result `{#2,#3,#1}` (base `[A,B,C]`; delete A, +D after A, +E after A; stamped {#2, #3, #1} = insert D, insert E, delete A):**
- Before deletes: A = `{seq:1}`, B = `{seq:2}`, C = `{seq:3}`, D = `{seq:4, afterParent:{seq:1}}`, E = `{seq:5, afterParent:{seq:1}}`.
- `cmp(D,E)`: same parent, own inverted → E < D. Order between them: E, D.
- `cmp(E,B)`: E has parent, B does not. Compare B (`{seq:2}`) vs E.afterParent (`{seq:1}`); B > parent, so E < B. ✓
- After A is deleted, A is removed from `_sequencedSubdirectories`. D and E retain their `afterParent` references. The comparator still works against the now-absent anchor's recorded `SequenceData`.
- Final order: `E, D, B, C`. ✓

**Nested insert-after (E after C, where C was inserted after A):**
- E = `{seq:5, afterParent: C.seqData}` where C.seqData = `{seq:3, afterParent:{seq:1}}`.
- `cmp(E,D)`: both have parents. Compare E.afterParent (C's key) vs D.afterParent (`{seq:1}`).
  - Recursive: E's parent has its own parent; D's parent does not. Per rule 2, E's parent sorts after D's parent. So E.afterParent > D.afterParent → E > D. ✓
- `cmp(E,B)`: E has parent, B does not. Compare B (`{seq:2}`) vs E.afterParent (C's key). Recursive: C's key has a parent (`{seq:1}`) and B does not. Compare B (`{seq:2}`) vs C's parent (`{seq:1}`); B > 1, so B > C.afterParent.parent; by rule 2 the sub-comparison resolves with B > C.afterParent; so E < B. ✓

### 3.4 Equality semantics for `afterParent`

"Same anchor" in rule 3 is determined by deep equality of the `SequenceData` chain, not by identity of the anchor object. Two insertions sharing an anchor get identical `afterParent` values because both copied the anchor's `SequenceData` at stamp time — even though the anchor itself may have been deleted afterwards. This is intentional: the anchor is a value, not a pointer.

## 4. Op format

Current op (directory.ts:166–181):

```ts
interface IDirectoryCreateSubDirectoryOperation {
    type: "createSubDirectory";
    path: string;
    subdirName: string;
}
```

Proposed:

```ts
interface IDirectoryCreateSubDirectoryOperation {
    type: "createSubDirectory";
    path: string;
    subdirName: string;
    afterSubdirName?: string;   // NEW: optional ordering hint
}
```

The new field is optional. Ops from old clients omit it and behave exactly as before (append). Ops from new clients that don't use the new API also omit it.

## 5. Mixed-version session compatibility

When a new client submits an op with `afterSubdirName`:

- **Sequencing server** (opaque): forwards the op verbatim. No change needed.
- **Other new clients**: honor the hint per the requirements spec.
- **Old clients** (don't know about the field): ignore the field, apply the op as a plain append. Their local ordering will *not* match the requirements spec for that subdirectory until they upgrade. No session-breaking behavior; it's best-effort degradation.

This is consistent with how other optional op fields have been rolled out in SharedDirectory historically. A release-note callout ("insertion ordering hints require clients on version X or later to observe") is sufficient; we do not need a hard version gate.

## 6. Snapshot compatibility

Current `ICreateInfo` (directory.ts:279–289):

```ts
interface ICreateInfo {
    csn: number;       // creation sequence number
    ccIds: string[];   // creator client IDs
}
```

Proposed:

```ts
interface ICreateInfo {
    csn: number;
    ccIds: string[];
    afterParent?: ICreateInfo;   // NEW: recursive structure, optional
}
```

On serialize: if the subdirectory's `seqData.afterParent` is present, serialize it recursively as `afterParent` on the persisted `ICreateInfo`. Otherwise omit.

On load:
- Old snapshots have no `afterParent` field. Subdirectories load with `seqData.afterParent === undefined` → behave as plain appends, which is correct (the hint was never recorded).
- New snapshots with `afterParent` load into the new `seqData` shape. Old clients reading new snapshots will silently ignore the field (JSON deserialization discards unknown keys) and treat the subdirectory as a plain append — same best-effort degradation as mixed-version ops.

Recursive size bound: `afterParent` chains have length bounded by the depth of insert-after chaining at the moment each subdirectory was created. In practice this is shallow (Word's use case is "insert this comment after that comment," not long chains). If chains grow pathological, snapshot size grows linearly with chain length per subdirectory; this is a theoretical concern but not a practical one for the stated use case. We will add a test that confirms reasonable-size chains round-trip correctly and note the linear bound in code comments.

## 7. Local optimistic path

Requirements §4.8 says the local view shows the requested position immediately. Implementation:

1. In `createSubDirectoryOrderedAfter`, resolve the anchor in the caller's local visible state via `getOptimisticSubDirectory` (the method already used by local creates; directory.ts:~1310).
2. If found, copy the anchor's current `seqData` (may itself be pending, with `seq = -1`) as the new pending entry's `afterParent`.
3. If not found locally, leave `afterParent` undefined; the local view will append, consistent with §4.4.
4. `subdirectories()` iteration (directory.ts:1466–1472) uses the new comparator over the combined sequenced + pending set. No additional code path needed — the comparator handles pending entries the same way.
5. When the op is ack'd, the pending entry's `afterParent` is replaced with the anchor's *sequenced* `seqData` (if the anchor exists at stamp time) — which may differ from the local-time anchor seq. See §8.

## 8. Reconnect / resubmit

The current resubmit flow (directory.ts:2347–2369) preserves the original op payload and does not re-validate. With the new field, the op is resubmitted carrying the original `afterSubdirName`. On stamping, the receiving clients resolve the anchor against their current sequenced state — exactly the same rule as for a freshly-submitted op. No new reconnect logic is needed.

Local state during reconnect: the pending entry's optimistic `afterParent` may become stale if the anchor was deleted concurrently or its `seqData` changed. Two acceptable approaches:

- **Approach 1 (simpler):** Leave the pending entry's `afterParent` untouched during the offline window. Iteration order on the local client may be slightly off relative to eventual stamped order, but since the whole client is offline, this is only visible to the local user briefly. On ack, `afterParent` is replaced with the sequenced anchor's `seqData`.
- **Approach 2 (optional refinement):** On remote op receipt during offline replay, re-resolve pending `afterParent` values against the current sequenced state. More work; marginal benefit. Not proposed for the first implementation.

Approach 1 is proposed. Call it out in tests so the reconnect ordering behavior is pinned.

## 9. Test plan

All tests go in `packages/dds/map/src/test/mocha/`. Primary file: extend `directory.order.spec.ts`. Add a new file for reconnect scenarios if `reconnection.spec.ts` grows unwieldy.

### 9.1 Requirements-spec examples as tests (required coverage)

Each of Examples 1–4 in the requirements spec becomes an explicit test case. For Example 4, all four stamping orders are exercised. Use `MockContainerRuntimeFactory.processSomeMessages(n)` to control stamping order (directory.order.spec.ts:185).

### 9.2 Ambiguity-resolution cases (required coverage)

One test per resolved ambiguity:
- **Q1** — anchor never created locally → call succeeds, local view appends.
- **Q1** — anchor deleted locally → call succeeds, local view appends.
- **Q2** — anchor deleted and recreated before stamp → new anchor is used.
- **Q3** — call returns `IDirectory` even when fallback occurs.
- **Q6** — `newSubdirName` already exists → returns existing; positioning hint ignored.
- **Q7** — local view shows position immediately after call; position may shift on ack under concurrent remote activity.

### 9.3 Recursive sort key edge cases

- Insert after a subdirectory that was itself inserted after another (chain of length 2).
- Mixed tree of plain creates and ordered creates interleaved at different sequence numbers.
- Concurrent inserts after different anchors (interaction across sort-key prefixes).

### 9.4 Snapshot round-trip

- Serialize a directory with `afterParent` chains, load into a fresh instance, verify iteration order matches.
- Load an old-format snapshot (no `afterParent` field) into new code → all entries treated as plain appends.
- Load a new-format snapshot into old-format `ICreateInfo` code path (simulated) → `afterParent` silently dropped; entries appear as plain appends.

### 9.5 Reconnect / resubmit

- Disconnect after calling `createSubDirectoryOrderedAfter`, reconnect, observe stamped ordering matches the requirements spec.
- Concurrent remote delete of anchor during offline window → on reconnect, the inserted subdirectory falls back to append per §4.4.
- Concurrent remote creation of same-name subdirectory during offline window → on reconnect, same-name merge applies per §4.3.

### 9.6 Detached state

- Create a detached SharedDirectory, use ordered creates, attach → verify iteration order survives the attach.

### 9.7 Oracle / equivalence tests

Extend `directoryOracle.ts` and `directoryEquivalenceUtils.ts` to support the new ordering. Run existing fuzz tests with the new API enabled.

### 9.8 Fuzz and stress validation (required)

The unit tests in §9.1–§9.7 pin specific scenarios, but the real risk surface for the recursive comparator and the local-optimistic-vs-stamp-time afterParent mutation is random concurrent operation sequences. The implementer **must** run the following as they go (not just at the end) and fix anything that reproduces:

1. **`packages/dds/map/src/test/mocha/directoryFuzzTests.spec.ts`** — the existing randomized directory fuzz suite, which operates over the `baseDirModel` op set. Before running, extend the `baseDirModel` operations (see `packages/dds/map/src/test/index.ts` exports and the fuzz utilities in `fuzzUtils.ts`) to include `createSubDirectoryOrderedAfter` with a random existing-sibling anchor. Without this extension, fuzz coverage of the new API is zero. Run via `npm run test:mocha` in the map package; inspect seeds that fail.

2. **`packages/test/local-server-stress-tests`** — the cross-DDS stress harness already consumes the `baseDirModel` exported by `@fluidframework/map/internal/test` (see `packages/test/local-server-stress-tests/src/ddsModels.ts:11`). Once the fuzz model is extended in step 1, this harness picks up `createSubDirectoryOrderedAfter` automatically and exercises it under realistic multi-client-with-local-server conditions (including detach/reattach, snapshot, summarize/load, reconnect). Run via `npm run test` in that package. Seeds that fail here typically point at snapshot round-trip or op-ordering bugs that the unit tests miss because they fabricate simpler schedules.

3. **`packages/test/test-end-to-end-tests`** — the end-to-end suite runs scenarios against the in-repo driver stack. SharedDirectory is exercised by many of these tests transitively; run the subset that touches directory/summarization paths (e.g., `createNewSummaryCachingTests.spec.ts`, `detachedContainerTests.spec.ts`, `stagingMode.spec.ts`). This catches serialization, op-format, and reconnection regressions that only manifest through the full runtime.

Running these **as you go** — after each meaningful implementation chunk rather than only at the end — is important because the recursive-comparator design has non-obvious failure modes (anchor retained after delete, inversion tiebreaker only for same-anchor siblings, stamp-time re-resolution of the afterParent). If a fuzz seed fails, reduce it to a minimal unit test before attempting a fix so the regression is pinned in `directory.order*.spec.ts`.

## 10. Open implementation questions

These are *implementation-level* questions whose answers do not change observable behavior (so they are out of scope for the requirements spec) but should be settled before or during coding.

1. **Approach 1 vs Approach 2 for reconnect** (§8). Default to Approach 1. Revisit only if user-visible glitches are reported during offline edits.
2. **`afterParent` equality helper.** Add a small `seqDataEquals(a, b)` utility rather than inlining recursive-equality. Trivial, but worth a named helper for readability.
3. **Interaction with future `SharedDirectory` changes.** If other work (e.g., Option B in the background) reshapes `SequenceData`, coordinate. As of the date of this plan the branch is at parity with `main`.
4. **Performance.** The recursive comparator is O(d) per comparison where d is chain depth. `subdirectories()` is already O(n log n) per call due to sort-on-read. New cost: O(n log n × d). Expected d ≈ 1 for Word's workloads. Not a concern at this scale; revisit if profiles show sort overhead growing.

## 11. Rollout sequence

1. Land the requirements spec (already committed).
2. Land this implementation plan.
3. Write tests (TDD) — all tests from §9.1–§9.6 as failing tests first, per Nori workflow.
4. Implement: op shape → `SequenceData` → comparator → local create path → process → resubmit → serialize/deserialize.
5. Run full `packages/dds/map` test suite; fix any regressions in existing tests.
6. **Extend the `baseDirModel` fuzz operations to include `createSubDirectoryOrderedAfter`** (§9.8 step 1). Run `directoryFuzzTests.spec.ts` to completion on the default seed range; fix anything that reproduces and pin the failing seed as a new unit test.
7. **Run `packages/test/local-server-stress-tests`** (§9.8 step 2). Fix anything that reproduces.
8. **Run the relevant subset of `packages/test/test-end-to-end-tests`** (§9.8 step 3) — at minimum the directory/summarization tests.
9. Update `api-report/map.*.api.md` via `build:api-reports` (never hand-edit).
10. Changeset for the new public API (Fluid uses changesets, not changie).
11. PR with link to requirements spec and this plan in the description.

Steps 6–8 are non-negotiable before marking the PR ready for review. Fuzz coverage of the new op is zero until step 6 lands, and the recursive comparator has more surface area than the unit tests alone exercise.
