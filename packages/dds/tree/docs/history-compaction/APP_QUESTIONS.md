# History compaction: questions for app teams

This document walks through one small example and asks the questions we need app teams to answer before the API is finalized.
Each question explains what it means in the example, what SharedTree does today, and the options we are considering.
There is space after each question to record the app team's answer.

For the API itself, see [APP_GUIDE.md](./APP_GUIDE.md).
For implementation details, see [DEV.md](./DEV.md).

## Contents

- [The basic example](#the-basic-example)
- [What commit metadata looks like](#what-commit-metadata-looks-like)
- [A. Deciding whether to combine](#a-deciding-whether-to-combine)
- [B. Metadata after combining](#b-metadata-after-combining)
- [C. When compaction happens](#c-when-compaction-happens)
- [D. Points in time that must never be combined](#d-points-in-time-that-must-never-be-combined)
- [E. What users see](#e-what-users-see)
- [F. Rollout](#f-rollout)
- [Answer summary](#answer-summary)

---

## The basic example

A document has five edits, A to E, made in that order.
Each edit is a **commit**: a change plus the custom metadata the app attached to it (for example the user, the session, or a timestamp).
Each commit also marks a **point in time** the user could restore to.

### Step 1: only old commits can be combined

```text
   history only (can be combined)          still in use (cannot be combined)
 ┌───────────────────────────────────┐    ┌───────┐
 │  A  ◄──  B  ◄──  C  ◄──  D        │◄───│   E   │◄── Head
 └───────────────────────────────────┘    └───────┘
                                       ▲
                       minimum sequence number (MSN)
```

E is newer than the **minimum sequence number (MSN)**: some collaborator may still be editing from a state before E,
so E is needed to merge their edits correctly.
SharedTree never offers such commits to the app.

A to D are older than the MSN.
They are kept only because the app asked to retain history (`retainHistory`), so they can be combined.

### Step 2: the app combines C and D

SharedTree asks the app's policy about each pair of neighbouring old commits, oldest first.
Suppose the app answered "no" for (A, B) and (B, C), and "yes" for (C, D):

```text
 ┌───────────────────────────────────┐    ┌───────┐
 │  A  ◄──  B  ◄──  (C + D)          │◄───│   E   │◄── Head
 └───────────────────────────────────┘    └───────┘
```

`C + D` is one commit with D's revision.
The state "right after C" can no longer be restored; the state "right after D" can.

### Step 3: the minimum sequence number moves past E

As collaborators catch up, the MSN increases and E is no longer needed for merging:

```text
 ┌───────────────────────────────────────────────────┐
 │  A  ◄──  B  ◄──  (C + D)  ◄──  E                  │◄── Head
 └───────────────────────────────────────────────────┘
```

### Step 4: the question SharedTree asks the app

> **Should E stay a separate commit?**
> In other words: should users still be able to restore the state between `C + D` and E?

SharedTree asks the app's policy, at the next compaction pass:

```typescript
canCompactCommit({ current: C_plus_D, target: E }): boolean | JsonCompatibleReadOnlyObject
```

```text
                       canCompactCommit(current: C + D, target: E)
                                      │
                ┌─────────────────────┴─────────────────────┐
              false                                   true (or an object)
                │                                           │
                ▼                                           ▼
  A ◄── B ◄── (C + D) ◄── E               A ◄── B ◄── (C + D + E)
  "after D" is still restorable           "after D" is gone; the combined
                                          commit keeps E's revision
```

- `current` (`C + D`) is the older commit. It is removed if the answer is yes.
- `target` (E) is the newer commit. It absorbs `current` and keeps its own revision.
- The current document content is the same either way. Only the history leading to it changes.

The questions below are about how the app makes this decision and what it expects afterwards.

---

## What commit metadata looks like

### Attaching metadata

The app attaches metadata when it makes an edit:

```typescript
view.runTransaction(
	() => { /* edit view.root */ },
	{ customMetadata: { user: "ana", session: "s1", time: 30, note: "intro" } },
);
```

There is no API to change it afterwards.
Only compaction rewrites the metadata that history holds for a commit.

### What the policy and history APIs see

Each commit is a `TreeBranchCommitMetadata`. The two metadata fields are:

| Field | What it is |
| --- | --- |
| `customTree` | The full structure: `{ metadata, children }`. `metadata` is what one transaction attached; `children` are nested transactions (or, after compaction, the combined commits). |
| `custom` | `customTree` flattened into one object. On a conflicting key, an outer node wins over its children, and a later sibling wins over an earlier one. |

The three commits in the example, before any compaction:

```typescript
// C  (revision "rev-C")
custom:     { user: "ana", session: "s1", time: 30, note: "intro" }
customTree: { metadata: { user: "ana", session: "s1", time: 30, note: "intro" }, children: [] }

// D  (revision "rev-D")
custom:     { user: "ana", session: "s1", time: 34 }
customTree: { metadata: { user: "ana", session: "s1", time: 34 }, children: [] }

// E  (revision "rev-E")
custom:     { user: "ana", session: "s1", time: 42 }
customTree: { metadata: { user: "ana", session: "s1", time: 42 }, children: [] }
```

A commit made without metadata has `custom` and `customTree` both `undefined`.

### Combining C and D (Step 2)

The policy is called with `current` = C and `target` = D. What `C + D` holds depends on what the policy returns:

**`false`:** nothing changes. C and D stay separate, with the metadata above.

**`true` (default merge):** the combined commit keeps D's revision.
Both original trees become children of a new node that has no metadata of its own:

```typescript
// C + D  (revision "rev-D")
customTree: {
	metadata: undefined,
	children: [
		{ metadata: { user: "ana", session: "s1", time: 30, note: "intro" }, children: [] }, // C
		{ metadata: { user: "ana", session: "s1", time: 34 }, children: [] },               // D
	],
}
custom: { user: "ana", session: "s1", time: 34, note: "intro" }
//                                    ^^^^^^^^ D wins the conflict   ^^^^^^^^^^^^^ only C had it, so it is kept
```

**An object, for example `{ user: "ana", session: "s1", start: 30, time: 34, count: 2 }`:**
the combined commit keeps D's revision, and the object **replaces** both commits' metadata.
C's `note` is gone unless the app copies it into the object.

```typescript
// C + D  (revision "rev-D")
customTree: { metadata: { user: "ana", session: "s1", start: 30, time: 34, count: 2 }, children: [] }
custom:     { user: "ana", session: "s1", start: 30, time: 34, count: 2 }
```

### Combining `C + D` with E (Step 4)

The policy is now called with `current` = `C + D` (with whatever metadata the previous answer produced) and `target` = E.
If it answers yes again, the result keeps E's revision.

**`true` again:** the tree nests one level deeper on every combination, so it grows with each original commit:

```typescript
// C + D + E  (revision "rev-E")
customTree: {
	metadata: undefined,
	children: [
		{ metadata: undefined, children: [ /* C */, /* D */ ] }, // the earlier C + D
		{ metadata: { user: "ana", session: "s1", time: 42 }, children: [] }, // E
	],
}
custom: { user: "ana", session: "s1", time: 42, note: "intro" }
```

`custom.time` is now 42. The start of the run (30) is only visible by walking `customTree`.

**An object again:** the app reads its own previous object from `current.custom` and builds the next one:

```typescript
canCompactCommit: ({ current, target }) => {
	// current.custom = { user: "ana", session: "s1", start: 30, time: 34, count: 2 }
	// target.custom  = { user: "ana", session: "s1", time: 42 }
	const start = current.custom?.start ?? current.custom?.time;
	const time = target.custom?.time;
	if (typeof start !== "number" || typeof time !== "number") return false;
	if (time - start >= 10) return false; // keep E separate
	const count = typeof current.custom?.count === "number" ? current.custom.count : 1;
	return { ...target.custom, start, count: count + 1 };
};
```

Here 42 − 30 ≥ 10, so the policy returns `false` and E stays separate.
With `true` in Step 2, the same rule would see `time: 34` and combine (see [B1](#b1-what-should-c--d-look-like-when-it-is-compared-with-e)).

### Summary

| | Revision | `customTree` | `custom` | Original metadata kept? |
| --- | --- | --- | --- | --- |
| Not combined | Unchanged | Unchanged | Unchanged | Yes |
| `true` | Newer commit's | `{ metadata: undefined, children: [older, newer] }` | All keys from both; newer wins conflicts | Yes, as children; grows with each combination |
| Object | Newer commit's | `{ metadata: object, children: [] }` | Exactly the object | No, unless the app copies it in |

Notes:

- If only one of the two commits has metadata, `true` keeps that commit's tree unchanged instead of nesting it.
- A `true`-combined commit has the same shape as one commit made by an unannotated outer transaction with annotated nested transactions, so the app cannot tell them apart ([B3](#b3-do-you-need-to-know-that-a-commit-is-the-result-of-combining)).
- This metadata change happens only in the compacting client's history. When the summarizer compacts, clients that load its summary see the new metadata. Clients already in the session keep the original metadata.

---

## A. Deciding whether to combine

### A1. What metadata do you attach to each edit?

**In the example:** what would C, D, and E carry? For example `{ user, session, time, saveId }`.

**Why it matters:** the policy can only use metadata attached when the edit was made.
It cannot look at document content or call your services.

**Also tell us:** roughly how large the metadata is per edit, and whether it can contain user data.

> **Answer:**

### A2. What rule decides that E stays separate?

**In the example:** given `C + D` and E, what makes you answer "no, keep E separate"?

| Example rule | Combine `C + D` with E when… |
| --- | --- |
| Same session | both have the same `session` |
| Same user, short burst | same `user`, and E is within N minutes of the burst's **start** |
| Explicit save | E has no `saveId` (only saves are kept as points in time) |
| Size | fewer than N edits have already been combined into `C + D` |

> **Answer:**

### A3. Is comparing two neighbours enough?

**In the example:** the policy sees only `C + D` and E (and can walk older commits with `getParent()`).
It cannot see commits newer than E, and it cannot return "combine B through E" in one answer.

**Options:** keep the pairwise question (today), or a policy that sees a range of commits and returns groups.

> **Answer:**

### A4. Can the decision depend only on metadata?

**In the example:** the answer about (`C + D`, E) must be the same no matter which client asks or when.

**Why it matters:** the decision that is saved is made by the **summarizer**, a hidden client that writes the stored copy of the document.
It may ask about the same pair many times, after reloads, and on different machines.
A rule that reads the clock, a user setting, or a feature flag can give different answers, and the stored history then depends on timing.

**Today:** declined pairs are asked again on every pass. The policy must be fast, deterministic, and free of side effects.

> **Answer:** Can your rule meet this? Is it a problem to be asked about the same pair more than once?

### A5. What should happen if your rule throws?

**Today:**

| Where the policy runs | If it throws |
| --- | --- |
| Summarizer (configured policy) | The rest of that pass keeps every pair. The summary is still written. The error is logged. |
| Manual `requestCompaction` call | The error is thrown to the caller and **the tree is marked broken**. Combinations already made stay. |

> **Answer:** Is this acceptable? Would you rather a manual call also keep the rest and report the error?

---

## B. Metadata after combining

### B1. What should `C + D` look like when it is compared with E?

See [What commit metadata looks like](#what-commit-metadata-looks-like) for the full before and after.

**In the example:** C = `{ user: "ana", time: 30 }`, D = `{ user: "ana", time: 34 }`, E = `{ user: "ana", time: 42 }`.
Rule: combine edits by the same user within 10 minutes of the **first** edit.

| If the policy returns… | `C + D` then looks like | Question about (`C + D`, E) |
| --- | --- | --- |
| `true` (default merge) | `{ user: "ana", time: 34 }`: newest value wins; C and D kept as children in `customTree` | 42 − 34 < 10: **combine** (wrong: the burst started at 30) |
| An object, such as `{ user: "ana", start: 30, time: 34 }` | Exactly that object; C and D's own metadata is replaced | 42 − 30 ≥ 10: **keep separate** (right) |

> **Answer:** Do your rules need the start, count, or range of a combined run? Would you build the combined metadata yourself?

### B2. Do you need C's and D's original metadata after they are combined?

**In the example:** after combining, should the history show "Ana edited at 30 and 34", or just "Ana edited"?

**Options:**

| Option | Keeps originals | Storage |
| --- | --- | --- |
| Default merge (`true`) | Yes, as children | Grows by one entry per original edit |
| Returned object replaces them (today) | No | One entry |
| Returned object is added on top, originals kept underneath | Yes | One small entry per combination |
| Choose per pair | Your choice | Your choice |

> **Answer:**

### B3. Do you need to know that a commit is the result of combining?

**In the example:** should the history UI be able to tell that `C + D` contains two edits?

**Today:** SharedTree adds no marker. Return your own (for example `{ count: 2 }`) if you need one.

> **Answer:**

---

## C. When compaction happens

### C1. Is a delayed decision acceptable?

**In the example:** E becomes eligible when the MSN moves past it (Step 3), but nothing happens at that moment.
SharedTree asks about (`C + D`, E) only at the next compaction pass:

- before the summarizer writes a summary (stored history), or
- when your code calls `requestCompaction` (this client's history only).

If no edits happen, the summarizer may reuse the previous summary and not run the policy.

> **Answer:** Do you need compaction to happen within a certain time? Is "at some later summary" enough?

### C2. Whose history should be combined?

**In the example:** combining (`C + D`, E) on the summarizer changes only the **stored** history.
Users already in the session keep A, B, C, D, E in memory until they reload.
Calling `requestCompaction` on a user's client changes only that client's history and does not affect storage.

> **Answer:** Is it enough to compact stored history? Do you also need open sessions to show the compacted history?

### C3. How much history do you keep?

**In the example:** with `retainHistory: 4`, A would be dropped as soon as E becomes old, whether or not anything was combined.
Combining makes each kept commit cover more edits, so the same limit reaches further back.

> **Answer:** Do you keep all history (`retainHistory: true`) or a number of commits? Which number?

---

## D. Points in time that must never be combined

### D1. Do some points in time have to stay restorable?

**In the example:** a user published or named the version "right after D".
Answering "yes" for (`C + D`, E) would remove it.

**Options:**

| Option | Protects | Limits |
| --- | --- | --- |
| **Metadata tag** (for example `keep: true` on D when it is made) and the policy returns `false` for it | `C + D` is never removed | Must be known when the edit is made. The commit can still absorb older commits. |
| **Pin** with `setRevisionPreserved(D, true)` | `C + D` is never combined, in either direction | Opt-in, new format; can be rejected if the summarizer already combined it. See [revision-preservation/DEV.md](./revision-preservation/DEV.md). |

> **Answer:** Do you know at edit time which points are checkpoints, or are they chosen later (for example from a timeline)?

### D2. What should happen to a checkpoint that is already gone?

**In the example:** the user pins "after C" from a timeline, but the summarizer already combined C into `C + D`.
The pin is rejected and every client is told through `revisionPreservationRejected`.

> **Answer:** How should the UI show this? Should a pin hold back the retention limit as well?

---

## E. What users see

### E1. Do you store revision IDs outside SharedTree?

**In the example:** after `C + D` is combined with E, D's revision no longer exists; the combined commit has E's revision.
Any bookmark, comment, or link that points to D's revision stops resolving.

> **Answer:** Where do you store revisions? Which should be protected (see D1)?

### E2. What should undo, redo, and restore do?

**In the example:** after combining, the user cannot restore to "after D".
A user who was already in the session can still undo E. A client that loads the compacted copy sees one commit.

> **Answer:** Is it acceptable that a long-lived session can undo finer-grained steps than a freshly loaded one?
> What should restore-to-version show for points that were combined away?

---

## F. Rollout

### F1. Can every client use the new formats?

| Feature | Requires |
| --- | --- |
| Policy reading metadata after reload | `minVersionForCollab` 2.117 or later, on every collaborating client |
| Pins | `enableRevisionPreservation`, a new op and summary format that older clients cannot read |

> **Answer:** When can all clients of your app be on these versions?

### F2. Which telemetry do you need?

**Today:** each compaction pass logs a `HistoryCompaction` event (counts, duration, failures; no document content or metadata).
See [APP_GUIDE.md §5](./APP_GUIDE.md#5-monitor-telemetry).

> **Answer:** Is that enough to tell whether your rule works? Do you need more per-commit detail?

---

## Answer summary

| # | Question | Answer |
| --- | --- | --- |
| A1 | Metadata per edit | |
| A2 | Rule for keeping E separate | |
| A3 | Pairwise enough? | |
| A4 | Deterministic from metadata? | |
| A5 | Behavior when the rule throws | |
| B1 | Metadata of the combined commit | |
| B2 | Keep originals? | |
| B3 | Mark combined commits? | |
| C1 | Acceptable delay | |
| C2 | Stored vs. in-session history | |
| C3 | Retention limit | |
| D1 | Checkpoints: tag or pin? | |
| D2 | Checkpoint already gone | |
| E1 | Stored revision IDs | |
| E2 | Undo, redo, restore | |
| F1 | Version rollout | |
| F2 | Telemetry | |
