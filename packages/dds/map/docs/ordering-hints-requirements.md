# SharedDirectory Insertion Ordering Hints — Requirements

**Status:** Draft
**Scope:** Requirements only. Implementation strategy is covered in a separate plan document.

## 1. Overview

`SharedDirectory` iteration order over its subdirectories is today controlled implicitly by the order in which subdirectory creations are stamped. Creating a subdirectory is effectively an "append." This works for append-only workloads but forces callers to reconstruct ordering when they need to insert in the middle of the sequence.

Word uses `SharedDirectory` subdirectories to model comments within a document; the iteration order of those subdirectories defines the ordering of the comments. In three-way-merge scenarios (reconciling non-Fluid edits made against a potentially much older state), Word needs to insert new comment subdirectories at specific positions within an existing thread. The only way to do this today is to delete every subdirectory ordered after the desired insertion point, insert the new ones, and re-create the deleted ones from scratch — a costly workaround.

This feature adds an `IDirectory` API that lets a caller create a new subdirectory at a requested position in its parent's ordered set of children, expressed as "order this new subdirectory after an existing named sibling."

## 2. Scope and Non-Goals

**In scope**
- A new method on `IDirectory` that creates a subdirectory with a positioning hint relative to an existing named sibling.
- Defined behavior for concurrent insertions, same-name collisions, and deleted-anchor cases.

**Non-goals**
- `SharedMap` has no subdirectories and no defined iteration ordering over keys. This feature does not apply to `SharedMap`.
- No "order before" variant is defined in this feature. ("Order after X" plus the existing append semantics is sufficient for Word's use case, and adding "order before" can be considered separately later.)
- No long-term relationship between the inserted subdirectory and its anchor. Deleting the anchor later does not affect the inserted subdirectory. The hint is single-shot, resolved at stamp time, and never re-evaluated afterwards.
- No change to the existing ordering of subdirectories created via `createSubDirectory`. Append-at-end remains the semantics of that method.
- No change to `SharedMap` or to unrelated `IDirectory` methods (`getSubDirectory`, `deleteSubDirectory`, etc.).

## 3. API Surface

Add the following method to the `IDirectory` interface:

```ts
interface IDirectory {
    /**
     * Creates an IDirectory child of this IDirectory with a requested position in
     * the ordered set of children. If a subdirectory with the given name already
     * exists, the existing subdirectory is returned and the positioning hint is
     * ignored (matching the semantics of {@link IDirectory.createSubDirectory}).
     *
     * The positioning hint ("order after the named sibling") is best-effort and
     * is resolved when the creation op is stamped. If the anchor does not exist
     * at stamp time — because it was never created, was deleted, or is not yet
     * visible to the stamping client — the new subdirectory is appended at the
     * end of the ordered set, matching the existing {@link IDirectory.createSubDirectory}
     * behavior. The hint establishes no long-term relationship with the anchor.
     *
     * @param newSubdirName - Name of the new child directory to create.
     * @param afterSubdirName - Name of an existing sibling directory to order the
     *                          new child directory after. May refer to a sibling
     *                          that does not currently exist locally; see the
     *                          behavioral requirements for fallback semantics.
     * @returns The `IDirectory` child. Never `undefined`; if creation would
     *          otherwise fail, the method throws, consistent with
     *          {@link IDirectory.createSubDirectory}.
     */
    createSubDirectoryOrderedAfter(
        newSubdirName: string,
        afterSubdirName: string,
    ): IDirectory;
}
```

## 4. Behavioral Requirements

The rules below describe observable behavior. They do not prescribe how the behavior is implemented.

### 4.1 Happy-path ordering

When `createSubDirectoryOrderedAfter('C', 'A')` is stamped and an anchor named `A` exists in the parent's sequenced subdirectory set at stamp time, the new subdirectory `C` is ordered immediately after `A` in the parent's iteration order. Any existing sibling that was previously ordered after `A` (for example `B`) is ordered after `C`, preserving its relative position to everything else.

### 4.2 Concurrent insertions after the same anchor (different names)

When two or more clients concurrently request insertion after the same anchor and stamp successfully, the later-stamped insertion is ordered **earlier** in the resulting sequence (closer to the anchor), mirroring the behavior of concurrent insertions at the same character position in `SharedString`.

> *Example:* Base `[A, B]`. Client #1 inserts `C` after `A`; client #2 inserts `D` after `A`. Stamping order {#1, #2} yields `[A, D, C, B]`. Stamping order {#2, #1} yields `[A, C, D, B]`.

### 4.3 Concurrent insertions with the same name

When two or more clients concurrently create a subdirectory with the **same name** (regardless of whether each used `createSubDirectory` or `createSubDirectoryOrderedAfter`, and regardless of whether they specified different anchors), the existing same-name merge behavior of `SharedDirectory` applies:

- The subdirectory is merged into a single logical entity. Only the first-stamped creation's positioning takes effect.
- Subsequent stamped creations with the same name do not change the position of the already-created subdirectory and their positioning hints are ignored.

> *Example:* Base `[A, B]`. Client #1 inserts `C` after `A`; client #2 inserts `C` after `B`. Stamping order {#1, #2} yields `[A, C, B]`. Stamping order {#2, #1} yields `[A, B, C]`.

### 4.4 Anchor missing at stamp time — fallback to append

If `afterSubdirName` does not identify an existing sequenced sibling at the time the creation op is stamped, the new subdirectory is appended at the end of the parent's ordered set, exactly as if `createSubDirectory` had been called. The positioning hint has no effect. This includes:

- The anchor was deleted before the op was stamped (concurrently with or before the insertion).
- The anchor was never created.
- The anchor existed at op creation time on the submitting client but does not exist at stamp time for any reason.

The method still returns the created `IDirectory`; fallback is not an error.

> *Example:* Base `[A, B]`. Client #1 deletes `A`; client #2 inserts `C` after `A`. Stamping order {#1, #2} yields `[B, C]`. Stamping order {#2, #1} yields `[C, B]`.

### 4.5 Anchor deleted and re-created before stamp

If the subdirectory originally named `afterSubdirName` is deleted and then a new subdirectory with the same name is created before the insertion op is stamped, the **currently sequenced subdirectory under that name at stamp time** is the anchor. The insertion is ordered after that currently-existing sibling, inheriting its position rather than the deleted one's. This matches the rule in §4.4 — the hint is resolved at stamp time against whatever state exists then — and preserves the single-shot, identity-free nature of the hint.

### 4.6 Combined concurrent insertions and deletion of the anchor

When an anchor's deletion is concurrent with one or more "order after" insertions, §4.4 determines the outcome for each insertion independently, based on whether the anchor is present at the moment that insertion is stamped.

> *Example (from source spec):* Base `[A, B, C]`.
> - Client #1 deletes `A`.
> - Client #2 inserts `D` after `A`.
> - Client #3 inserts `E` after `A`.
>
> | Stamping order | Result | Reasoning |
> |---|---|---|
> | {#1, #2, #3} | `[B, C, D, E]` | Both inserts see `A` already deleted → both append. `E` is later-stamped and appends last. |
> | {#1, #3, #2} | `[B, C, E, D]` | Both inserts see `A` already deleted → both append. `D` is later-stamped and appends last. |
> | {#2, #3, #1} | `[E, D, B, C]` | Both inserts see `A` present at stamp time and order after `A`; by §4.2, later-stamped (`E`) sorts earlier. `A` is then deleted. |
> | {#2, #1, #3} | `[D, B, C, E]` | `D` sees `A` present and orders after it. `A` is then deleted. `E` sees `A` deleted → append. |

### 4.7 Name collision on `newSubdirName`

If a subdirectory with the name `newSubdirName` already exists on this parent at the time `createSubDirectoryOrderedAfter` is called, the method returns the existing subdirectory unchanged and the positioning hint is ignored. This matches the existing semantics of `createSubDirectory` and keeps the two methods' contracts consistent.

### 4.8 Local optimistic ordering before acknowledgment

When a local client calls `createSubDirectoryOrderedAfter('C', 'A')` and the anchor `A` is visible in the local state at call time, the local client's iteration order places `C` immediately after `A` as soon as the call returns, before the op is stamped by the server. This matches the "insert here" intent of the caller and avoids a visible reposition-on-ack glitch in UI scenarios.

If the anchor is not present locally at call time, the new subdirectory is appended in the local view, matching §4.4's fallback rule for the local phase. If the anchor is deleted locally between call time and acknowledgment, no local reposition is required — the op will be re-resolved against sequenced state at stamp time.

The local optimistic position is not authoritative. The position after acknowledgment may differ from the local position if concurrent remote activity changes the stamped outcome. Callers that depend on stable ordering must wait for acknowledgment, just as they would for any other `SharedDirectory` operation.

### 4.9 No durable anchor relationship

Once a `createSubDirectoryOrderedAfter` op is stamped, the anchor no longer needs to be tracked. The hint establishes no durable relationship:

- Deleting the anchor later does not affect the inserted subdirectory.
- Renaming or recreating the anchor later does not affect the inserted subdirectory.
- The inserted subdirectory's position is determined by the ordering algorithm alone, not by a back-reference to the anchor.

### 4.10 Detached-state behavior

Before a `SharedDirectory` is attached to a container, operations are not sequenced. `createSubDirectoryOrderedAfter` in the detached state uses the local ordering with the positioning hint applied immediately, consistent with §4.8. On attach, the existing `SharedDirectory` attach flow preserves the local iteration order exactly as it appeared in the detached state.

## 5. Resolved Ambiguities

Each subsection records a question that was not fully determined by the original feature request, the options considered, the decision, and the reasoning. Recording the options helps future readers evaluate edge cases the rule does not explicitly cover.

### 5.1 (Q1) Local anchor missing at call time

**Question.** If `afterSubdirName` does not identify a sibling visible on the local client at the time `createSubDirectoryOrderedAfter` is called (never created locally, or already locally deleted), does the method throw synchronously, or accept the call and fall back to append?

**Options.**
- **A.** Throw synchronously — treat a missing local anchor as a programming error.
- **B.** Accept the call and fall back to append (either locally right away, or at stamp time, or both).

**Decision.** Option B. Fallback to append, with the local view also appending per §4.8.

**Reasoning.** The original feature request describes the positioning as a hint, not a constraint, and defines fallback behavior at stamp time (Examples 3 and 4). Treating a missing anchor as a hard local error would introduce a second contract — "throws locally but silently falls back remotely" — for what is, at the spec level, the same condition. A single rule ("missing anchor, append") that applies uniformly at both call time and stamp time is simpler and matches the caller's mental model better. This is especially important for three-way merge scenarios like Word's, where the local view may be stale relative to the target state and exception handling around every call is unwanted friction.

### 5.2 (Q2) Anchor deleted and re-created before stamp

**Question.** If the anchor named `afterSubdirName` is deleted and a new subdirectory with the same name is created before the insertion op is stamped, does the new same-named subdirectory count as the anchor, or is the condition treated as "anchor missing"?

**Options.**
- **A.** Resolve the anchor at stamp time against whatever is currently sequenced under that name. A re-created same-named subdirectory counts as the anchor.
- **B.** Bind the anchor identity at op creation time (e.g., by carrying the anchor's creation sequence number on the op). A re-created same-named subdirectory is not the original anchor and the hint falls back to append.

**Decision.** Option A. Resolve the anchor at stamp time by name, against the currently sequenced state.

**Reasoning.** The hint is by name, not by identity — the API takes a string, and the caller's intent is expressed in terms of "the subdirectory that is visible under this name." The single-shot, identity-free model also matches the source spec's note that the anchor does not need to be tracked once the op is stamped. Option B would require carrying the anchor's creation sequence number on the op and additional anchor-identity bookkeeping, and would produce outcomes the caller is unlikely to want (e.g., inserting next to a live sibling becomes an append when a same-named sibling was coincidentally recycled). Option A is simpler and closer to caller intent.

### 5.3 (Q3) Return value when the positioning hint falls back

**Question.** When the positioning hint cannot be honored (anchor missing at stamp time) and the new subdirectory is appended instead, does the method still return the created `IDirectory`, or does it return a different value to signal the fallback?

**Options.**
- **A.** Always return the created `IDirectory`. Fallback is a quiet degradation, observable only by inspecting the resulting order.
- **B.** Return something that indicates fallback (e.g., a tuple, a boolean flag, `undefined`).

**Decision.** Option A. Always return the created `IDirectory`.

**Reasoning.** Creation always succeeds (modulo the existing same-name merge); only the positioning is best-effort. Signaling fallback in the return value would complicate the common path for the minority case, and callers that care about final position must already observe the eventual iteration order rather than trusting a return value at call time. The signature mirrors `createSubDirectory`, which is consistent and easier to reason about.

### 5.4 (Q6) Name collision on `newSubdirName`

**Question.** If a subdirectory with the name `newSubdirName` already exists on this parent, does `createSubDirectoryOrderedAfter` throw, or does it return the existing subdirectory as `createSubDirectory` does?

**Options.**
- **A.** Throw on name collision.
- **B.** Return the existing subdirectory unchanged, ignoring the positioning hint, exactly as `createSubDirectory` does today.

**Decision.** Option B. Inherit `createSubDirectory`'s tolerant behavior.

**Reasoning.** The original feature request states "there must not already be an `IDirectory` child of this `IDirectory` with the given name," but the existing `createSubDirectory` API is itself tolerant of that condition and returns the existing child. Diverging the two sibling APIs' contracts on name collision would be surprising and would force callers to use different call sites depending on which API they use. Callers who want strict semantics can check `getSubDirectory` before calling.

### 5.5 (Q7) Local optimistic ordering before acknowledgment

**Question.** When a caller issues `createSubDirectoryOrderedAfter('C', 'A')` on a connected client, what does the local iteration order return for the parent before the op is acknowledged — `C` positioned after `A`, or `C` appended with a reposition after ack?

**Options.**
- **A.** Show the requested position immediately. The local view places `C` after `A` before ack. Local position may shift after ack if concurrent remote activity changes the stamped outcome.
- **B.** Append locally until ack, then reposition to the acknowledged position. Produces a visible "jump" for UIs that observe the iteration order between call and ack.

**Decision.** Option A. Show the requested position immediately.

**Reasoning.** The point of the API is insertion-at-position; returning to the caller with the new subdirectory at the wrong position, even briefly, defeats that point for any UI scenario (which is the primary motivating use case). The cost of Option A is that the caller must understand that the position is optimistic and may shift after ack — but optimistic local state is already how the rest of `SharedDirectory` behaves and is documented accordingly in §4.8.

## 6. Questions explicitly not resolved here

The following were considered and deliberately left out of this spec because they are not requirements-level:

- **Reconnect / resubmit behavior.** Whether the client re-resolves the anchor on resubmit or preserves the original op payload is an implementation choice. Both strategies produce the same observable outcome under the rules above, because the spec's rules are expressed entirely in terms of state at stamp time. This is covered in the implementation plan.
- **`SharedMap`.** Out of scope (§2).
- **Self-reference (`afterSubdirName === newSubdirName`).** `newSubdirName` does not exist at the time the hint is resolved (it is in the process of being created), so this condition is covered by §4.4 (anchor missing → append). No additional rule is needed.
- **Choice of implementation platform** (extend the current `SharedDirectory` codepath vs. replat on `SharedTree` internals behind a facade). Addressed in the implementation plan.

## 7. Glossary

- **Anchor.** The existing subdirectory named by `afterSubdirName` at the time the creation op is stamped.
- **Stamp / stamped.** The point at which an op is assigned an authoritative sequence number by the Fluid service and becomes visible to all session participants in a single defined order.
- **Sequenced subdirectory.** A subdirectory whose creation op has been stamped. Pending (unack'd) local creations are not sequenced.
- **Fallback.** The behavior when the positioning hint cannot be applied: the new subdirectory is appended at the end of the parent's ordered set.
