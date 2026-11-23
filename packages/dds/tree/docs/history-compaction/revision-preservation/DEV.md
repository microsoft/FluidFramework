# SharedTree revision preservation (pins): developer guide

This is the detailed guide to preserved revisions ("pins") in SharedTree.
It explains the API contract, the implemented design, the persisted format, known risks, telemetry, tests, and open questions.

> Status: **experimental (`@alpha`), opt-in** through `historyCompaction.enableRevisionPreservation`.
> The pin format is a prototype and is not yet gated by `minVersionForCollab` ([§7.2](#72-format-gating)).

Revision preservation is layered on [history compaction](../DEV.md):
pins exist only to stop compaction from merging a chosen revision away.
Read the compaction guide first for the history model (trunk, MSN, trimming vs. compaction), client roles, and the compaction algorithm.
The compaction guide summarizes how the engine treats pins in [§9](../DEV.md#9-interaction-with-preserved-revisions) and [§11](../DEV.md#11-how-compaction-handles-pins);
this guide owns everything else about pins.

## Contents

1. [Relationship to compaction](#1-relationship-to-compaction)
2. [API](#2-api)
3. [Design decisions](#3-design-decisions)
4. [Design](#4-design)
5. [Where the code lives](#5-where-the-code-lives)
6. [Persisted format](#6-persisted-format)
7. [Data-integrity risks](#7-data-integrity-risks)
8. [Telemetry](#8-telemetry)
9. [Tests and running](#9-tests-and-running)
10. [Open questions](#10-open-questions)
- [Glossary](#glossary)

---

## 1. Relationship to compaction

| Concern | Owned by |
| --- | --- |
| Which commits are eligible, the policy, pair walking, composing, metadata | [Compaction DEV.md](../DEV.md) |
| Skipping a pair when either commit is pinned (before the policy is called) | Compaction engine (`EditManager.compactHistory`); contract in [compaction §11](../DEV.md#11-how-compaction-handles-pins) |
| Dropping a pin when its commit is trimmed | Trimming (`EditManager.trimHistory`); see [§4.2](#42-rule-2-pins-do-not-stop-trimming) |
| Pin API, op, rejection, summary field, format gate, events | This guide |

Pins do not change what compaction does to unpinned commits.
Engine-failure isolation, the collaboration window, and local-fork bounds apply independently of pins.

## 2. API

A **pin** keeps one point in time restorable even if the policy would merge it away
(a named version, a published version, a point before a risky bulk edit).
"Preserved" means: **the document state right after revision R stays restorable, under the same revision.**

```typescript
const factory = configuredSharedTree({
	retainHistory: 1000,
	historyCompaction: { canCompactCommit: sameSession, enableRevisionPreservation: true },
}).getFactory();

const compaction = asAlpha(tree).historyCompaction;
compaction.setRevisionPreserved(revision, true); // pin; sent to every client
compaction.isRevisionPreserved(revision); // true once this client applied the pin (optimistic for the caller)
compaction.setRevisionPreserved(revision, false); // unpin
compaction.events.on("revisionPreservationRejected", (revision) => { /* the checkpoint is gone */ });
```

`setRevisionPreserved` throws a `UsageError` when:

- `enableRevisionPreservation` is off, or shared branches or detached-root editing is enabled;
- pinning a revision this client does not know;
- pinning a revision no longer in the main history (trimmed or compacted).

Unpinning an unknown revision does nothing. These errors do not break the tree.
`setRevisionPreserved` returns `void`: the real outcome is known only when the summarizer processes the op.

Contract summary:

| Question | Answer |
| --- | --- |
| Does a pin stop compaction? | Yes, in both directions, on every client. |
| Does a pin stop trimming by `retainHistory`? | **No.** A pinned commit outside the limit is trimmed and its pin dropped ([§4.2](#42-rule-2-pins-do-not-stop-trimming)). |
| Is a pin shared? | Yes, through an op, and stored in the summary. |
| Is `isRevisionPreserved() === true` a guarantee? | No. It is optimistic until the summarizer processes the pin. If the summarizer already lost R, it sends a rejection and `revisionPreservationRejected` fires ([§4.4](#44-rule-4-the-summarizer-rejects-pins-it-cannot-keep)). |
| Can I tell trimming from compaction in a rejection? | No. |
| Should I auto-retry after a rejection? | No: re-pinning is rejected again. |

## 3. Design decisions

| Decision | Reason | What the code does |
| --- | --- | --- |
| **Pins are shared through an op and stored in the summary.** | A pin only protects stored history if the summarizer knows it; authored metadata cannot be edited later. | `preserveRevision` op and `preservedTrunkIndices` summary field. |
| **Pins are opt-in, under a separate format.** | Older clients cannot read the new op and summary format. | `enableRevisionPreservation` selects `history-compaction\|v0.1`. |
| **Pins are optimistic; the summarizer rejects what it cannot keep.** | The caller cannot know synchronously whether the summarizer still has R. | Rejection op with `rejected: true` and the `revisionPreservationRejected` event. |

Compaction-wide decisions (ownership, policy shape, summary-time execution) are in [compaction §10](../DEV.md#10-design-decisions).

## 4. Design

### 4.1 Rule 1: pins block compaction in both directions

```text
history:   A1 ─ A2 ─ [A3] ─ A4 ─ A5      ([A3] is preserved; the policy says "yes" to every pair)

(A1, A2)   → combine            → A2'
(A2', A3)  → skipped            →       A3 cannot absorb older commits
(A3, A4)   → skipped            →       A3 cannot merge into newer commits
(A4, A5)   → combine            → A5'

result:    A2' ─ [A3] ─ A5'              A3 keeps its original change data and metadata
```

`EditManager.compactHistory` skips a pair if `preservedRevisions` contains either revision, before calling the policy.
Preservation is a guarantee, not a hint. One pinned middle commit blocks two pairs (`preservedPairCount: 2`).
Unpinning makes the surrounding pairs eligible again on the next pass.

### 4.2 Rule 2: pins do not stop trimming

Option **P1** is implemented: a pinned commit counts toward `retainHistory: N` like any other.
When it falls outside the limit it is trimmed, and `EditManager.trimHistory` removes its pin.

- `retainHistory` stays the one setting that bounds memory and storage.
- Apps that need pins to live forever use `retainHistory: true`.
- Option **P2** (pins hold trimming back) can be added later as an opt-in.

Not yet done: telling the app when its own client trimmed a pin. A new pin on a revision the summarizer already trimmed is rejected (Rule 4).

**How a trimmed pin leaves the persisted format.**
No op or cleanup step is needed: the next summary from the summarizer simply no longer contains it.

1. The summarizer trims the commit: `EditManager.trimHistory` deletes each trimmed revision from `preservedRevisions`.
2. `EditManager.getSummaryData` writes only pins whose revision is in the summarized main trunk.
3. The format cannot hold an orphaned pin: `preservedTrunkIndices` are positions in that summary's own `trunk` array ([§4.5](#45-how-pins-are-stored)).
4. A summary is a full snapshot, so clients loading the new summary no longer see the pin.

Caveats:

- Only trimming on the **summarizer** changes storage. An interactive client that trims changes only its own memory.
- It can be delayed: with no new ops for the tree, the runtime reuses the previous summary handle ([§8.1](../DEV.md#81-the-configured-policy-summary-time)),
  and a freshly loaded client does not trim until it learns the MSN ([§22.3](../DEV.md#223-a-freshly-loaded-client-cannot-compact-yet)).
- With `retainHistory: true` nothing is trimmed, so a pin lasts until it is unpinned.
- Older summaries in storage still contain the pin, but clients load from the newest one.
- Test: "is dropped when the retention limit removes the commit" (`historyCompaction.spec.ts`).

### 4.3 Rule 3: pins are shared through an op

Stored history is compacted by the summarizer, so a pin kept only in the user's client would not protect it.

```text
app client                             service                summarizer client
──────────                             ───────                ─────────────────
setRevisionPreserved(R, true)
  apply locally (set now has R)
  send { type: "preserveRevision" } ─► sequence ─► all clients ─► apply (set now has R)
                                                                  summarize:
                                                                    policy skips (R, next)
                                                                    write preservedTrunkIndices
```

- Applied locally at once; re-applying when the op comes back does nothing.
- Every client applies the same pin ops in the same order, so all agree on the preserved set for the commits they still have.
- A pin on a not-yet-sequenced local commit is fine: the pin op is sent after the commit op.

### 4.4 Rule 4: the summarizer rejects pins it cannot keep

**The problem.**
The pin applies locally at once, but the summarizer may have compacted or trimmed R before it processes the pin op.
Previously the summarizer silently ignored it, while the pinning client's `isRevisionPreserved` stayed `true`;
the checkpoint was gone after reload.
Interactive clients keep their full history, so they cannot detect this.

**Implemented: option 1 (telemetry) and option 2 (rejection op).**

```text
app client                      service                 summarizer client (already compacted R)
──────────                      ───────                 ─────────────────
setRevisionPreserved(R, true)
  set has R (optimistic)
  send pin(R) ───────────────► sequence ─► all ────────► R not in history → ignore
                                                          log PreserveRevisionIgnored{rejectionSent: true}
                                          ◄───────────── send { type: "preserveRevision", R, preserved: false, rejected: true }
                               sequence ─► all clients
  set loses R                                             (set never had R)
  log PreserveRevisionRejected{wasPreserved: true}
  emit revisionPreservationRejected(R)
```

- Only the summarizer sends a rejection, because only its history reaches storage. Interactive clients only log.
- Every client processes the rejection like an unpin, so all agree again.
- The event fires on every client that had R marked when the rejection arrived (not only the requester).
- The summarizer is detected by `KernelArgs.isSummarizerClient`, which checks `deltaManager.clientDetails.type === "summarizer"`
  (the check `ContainerRuntime` uses). `SharedTreeCore.isSummarizerClient()` is a protected hook, `false` by default.
- Code: `SharedTreeCore.onPreserveRevisionIgnored` and `processPreserveRevisionRejection` (`sharedTreeCore.ts`);
  `SharedTreeKernel.onRevisionPreservationRejected` emits the app event (`sharedTree.ts`).

| Case | Behaviour |
| --- | --- |
| **The summarizer sends an op.** | Fluid intends to disallow local changes in the summarizer; today it only logs them (`identifyLocalChangeInSummarizer` in `packages/runtime/datastore/src/dataStoreRuntime.ts`). If that becomes an error, switch to option 4. **Main risk of option 2.** |
| Pinned again after a rejection | Rejected again, one event per rejection. |
| A later pin of the same R is pending when a rejection arrives | The optimistic pin is removed; the later pin is applied and rejected again. |
| No summarizer connected | No rejection until a summarizer processes the pin. A later one that loads a summary still containing R accepts it. |
| R was trimmed on the summarizer | Also rejected; indistinguishable from compaction. |
| Rollback of a rejection | Nothing; rejections are never local edits. |

**Option 4 (alternative, not implemented): only allow pins inside the collaboration window.**
`setRevisionPreserved(R, true)` would throw unless R is newer than the MSN (or unsequenced).
Since compaction only touches commits below the window, no client can have removed R before processing the pin.

- Pros: no rejection op; works if the summarizer is forbidden from sending ops; the result is known when the call returns.
- Cons: old checkpoints cannot be pinned after the fact (a common timeline request); success depends on timing.
- Can be combined with option 2: window pins always succeed, older pins may be rejected.

Other alternatives considered: check after a reload (option 3, slow) and a summarizer acknowledgement for every pin (more ops).

### 4.5 How pins are stored

A commit cannot hold the pin: authored `customMetadata` never changes,
and the summary stores each commit as `{ revision, sessionId, change, customMetadata?, sequenceNumber }`.
Pins are stored **next to** the commits.

```text
EditManager summary (v7)               EditManager summary (history-compaction|v0.1)
  trunk:    [c0, c1, c2, c3]             trunk:                 [c0, c1, c2, c3]   ← unchanged
  branches: [...]                        branches:              [...]
                                         preservedTrunkIndices: [1, 3]            ← c1 and c3 are pinned
```

| Where | Form | Code |
| --- | --- | --- |
| Memory | `Set<RevisionTag>` in `EditManager` | `editManager.ts`: `preservedRevisions` |
| Op | `{ version, type: "preserveRevision", originatorId, revision, preserved, rejected? }`; revision encoded relative to `originatorId` | `messageFormatVHistoryCompaction.ts`, `messageCodecVHistoryCompaction.ts` |
| Summary | `preservedTrunkIndices`: positions in the summary's `trunk` array | `editManagerFormatVHistoryCompaction.ts`, `editManagerCodecsVHistoryCompaction.ts` |

Indices, not revisions: the trunk is in the same blob, so indices are shorter, need no ID-compressor encoding,
and cannot point outside the summary. Only pins whose commit is in the summarized trunk are written.
An empty list reads back as "no pins"; an out-of-range index is an error.

### 4.6 Pin edge cases

| Case | Behaviour |
| --- | --- |
| Race with compaction | See Rule 4. To avoid it, pin soon after the commit is made, or tag the commit with metadata and check the tag in the policy. |
| Pin op for a commit this client already trimmed | Ignored, with `PreserveRevisionIgnored`. |
| Resubmit after reconnect | Sent again unchanged. Tested: a pin requested while disconnected reaches the summarizer after reconnect. |
| Rollback (abandoned transaction) | Approximate: applies the opposite pin. **Can diverge** ([§7.1](#71-medium-rolling-back-a-pin-can-diverge-from-other-clients)). |
| Stashed ops | Re-applied locally when loaded. |
| Detached tree | No op; the local set is written in the attach summary. |

### 4.7 Op leaks and lost rejections

Compaction sends no ops. Only pins (`preserveRevision`) and the summarizer's rejections do.
There is no unbounded or silent op leak in the engine, but these cases can produce extra ops or a stale pin.
None of them is covered by a test yet.

| Case | Possible? | Effect | Code |
| --- | --- | --- | --- |
| **Lost rejection on summarizer handoff.** The summarizer processes pin(R) at seq S and queues a rejection. It writes a summary at or after S, then closes before the rejection is sequenced. The next summarizer loads that summary and never re-processes pin(R). | Rare. Before summarizing, `ContainerRuntime` waits for pending ops (`Fluid.Summarizer.waitForPendingOpsTimeoutMs`, default 1s) and can fail the summary (`shouldFailSummaryOnPendingOps`); the final attempt may still continue. | The requester keeps `isRevisionPreserved(R) === true` for the session and gets no event. The pin is not in storage, so a reload is correct. | `SharedTreeCore.onPreserveRevisionIgnored`; `containerRuntime.ts` "PendingOpsWhileSummarizing" |
| **Duplicate rejection.** A new summarizer loads a summary older than pin(R) and rejects it again, after the old summarizer's rejection was already sequenced. | Yes | One extra op. Clients still agree. No second app event unless R was pinned again in between (that pin would be rejected anyway). | `processPreserveRevisionRejection` (`wasPreserved`) |
| **Rejection ping-pong.** The app re-pins on every `revisionPreservationRejected`. | Yes, caused by the app | One pin op and one rejection per retry, forever. Apps must not retry automatically ([§2](#2-api)). | — |
| **Rollback** of a pin that changed nothing | Yes | Local pin state diverges ([§7.1](#71-medium-rolling-back-a-pin-can-diverge-from-other-clients)). | `SharedTreeCore.rollback` |
| **Stashed pin that is a no-op** (revision gone at load) | Yes | `applyStashedOp` changes nothing, but the op is still resubmitted. Others ignore or reject it. Clients agree again. | `applyStashedOp`, `reSubmitCore` |
| **Rejection sent while processing an op** | Supported | `ContainerRuntime.process` runs in `ensureNoDataModelChanges`, so the op is reentrant. The outbox rebases batches with reentrant ops (resubmits them through `reSubmitCore`) before sending. | `opLifecycle/outbox.ts` (`hasReentrantOps`) |
| **Summarizer has a pending op at summary time** | Yes | Can log `PendingOpsWhileSummarizing` and delay a summary by up to the wait timeout. | `containerRuntime.ts` |
| **In-memory pin set grows** | No | Unpin, trimming, and rejection remove entries. With `retainHistory: true`, pins last until unpinned, by design. | `EditManager.preservedRevisions` |

Possible fixes for a lost rejection, not implemented:

- Have the summarizer also check pins against its own trunk before writing a summary, and send rejections for any it holds but cannot honour.
  This would not catch a pin it never processed.
- Let interactive clients re-check their optimistic pins against a newly loaded summary, as in option 3 of [§4.4](#44-rule-4-the-summarizer-rejects-pins-it-cannot-keep).
- Use option 4 (only pin inside the collaboration window). It needs no rejection at all.

Proposed telemetry is in [§19](../DEV.md#19-proposed-integrity-telemetry) (`PreserveRevision:RejectionPendingAtSummary`, `PreserveRevision:DuplicateRejection`).

### 4.8 Proposed: a better pin design

**Not implemented.** The current design (a shared `Set`, an op with last-writer-wins semantics, approximate rollback, and a summarizer rejection op) has four weaknesses:
rollback can diverge (§7.1), two callers pinning the same revision clobber each other, acceptance of an old pin is only known after a round trip through the summarizer, and a rejection can be lost on summarizer handoff (§4.7).

| Change | What it fixes | Cost |
| --- | --- | --- |
| **D1. Pin at creation through metadata (app side, no op).** The app writes a marker such as `customMetadata.keep: true` on the commit; its policy never combines a marked commit. | The common case ("this save is a checkpoint") with no new format, no op, no race, and no rejection. Works today. | Cannot pin after the fact or unpin. Trimming still drops it. |
| **D2. Owner-keyed pins.** `setRevisionPreserved(R, true, owner)`; state is `Map<R, Set<owner>>`; a revision is preserved while any owner holds it. | Independent features no longer clobber each other; unpinning is never ambiguous. | Format change (owner in op and summary). |
| **D3. Exact rollback.** Store the prior state in `localOpMetadata` at submit; rollback restores it, or does nothing for a no-op pin. | §7.1. | None (local only). |
| **D4. Deterministic acceptance inside the collaboration window.** A pin on a revision newer than the MSN at the op's reference sequence number is always accepted; every client can compute that, so no rejection is needed. Older pins keep the rejection path. | Most pins are known to succeed when the call returns; fewer summarizer ops. | Combines option 4 and option 2 from §4.4. |
| **D5. Summarizer re-validates pins before each summary.** Any pin it holds but no longer has history for gets a rejection, sent before the summary is written. | Lost rejection on handoff (§4.7), as long as the next summarizer loaded a summary containing the pin. | One check per summary. |
| **D6. Point-in-time semantics (optional).** A pin preserves the document state at R, not R's individual change. Absorbing *older* commits into R keeps that state, so only `(R, next)` is blocked; `(prev, R)` may merge. | A middle pin blocks one pair instead of two, so more history compacts. | R's change and metadata change ([compaction §14.3](../DEV.md#143-does-an-existing-revisions-metadata-change)); apps that need R's original metadata must keep using Rule 1. |
| **D7. Gate on `minVersionForCollab`** instead of `enableRevisionPreservation`. | [Compaction §17.4](../DEV.md#174-watch-format-and-compatibility), [§7.2](#72-format-gating). | Requires the version to be released first. |

**How compaction works with pins under this design:**

- Pins are **barriers**: the engine compacts runs between pins and never across one, as today (or only on the newer side with D6).
- The policy never sees a blocked pair, so its result does not depend on pins.
- Unpinning makes the surrounding pairs eligible on the next pass; there is no catch-up work.
- Engine-failure isolation ([compaction §13.5](../DEV.md#135-engine-failure-isolation)) is independent: a failed pair is skipped whether or not a pin is nearby.
- Trimming stays P1 (pins do not hold it back). P2 can be added later as an opt-in with a cap, so `retainHistory` remains the memory bound.

**Recommendation:** ship D1 guidance now (it covers checkpoints with no format risk).
Before the pin format leaves prototype, do D3 and D7, which are prerequisites, and D4 and D5, which close the summarizer races.
Add D2 if more than one feature in an app pins revisions.
Decide D6 together with the metadata-immutability question ([compaction §24.1](../DEV.md#241-contract-questions)).

## 5. Where the code lives

| Concern | Where | Why there |
| --- | --- | --- |
| Pin storage | `EditManager.preservedRevisions` | Trimmed with the trunk and written in the same summary blob. |
| Pin ops and rejection | `SharedTreeCore` | Owns sending, processing, resubmitting, rollback, and stashing ops. |
| Pin API mapping | `SharedTreeKernel` (`@throwIfBroken`) | Converts `CommitRevision` to `RevisionTag` (`idCompressor.tryRecompress`), checks the gate, throws `UsageError`s without breaking the tree. |
| Pin formats | `*VHistoryCompaction.ts` codecs; selection in `resolveFormatOptions` (`treeFactory.ts`) | Each wraps the matching v7 codec; always registered for reading. |

The subsystem flow diagram in [compaction §12.1](../DEV.md#121-subsystem-flow-and-correctness-changes) shows where pins enter the compaction path.

## 6. Persisted format

Compaction alone uses the v7 formats; pins add a new op type and summary field ([compaction §16](../DEV.md#16-what-changes-in-persisted-data)).

| Persisted data | Without pins | With `enableRevisionPreservation` |
| --- | --- | --- |
| Op format | v7 | `history-compaction\|v0.1` (adds `preserveRevision`) |
| EditManager summary format | v7 | `history-compaction\|v0.1` (adds `preservedTrunkIndices`) |
| Readable by older releases | Yes | **No** |

- The pin option sets write-version overrides in `resolveFormatOptions` (`treeFactory.ts`) with `allowPossiblyIncompatibleWriteVersionOverrides`, like shared branches.
  The new codecs are always registered for reading.
- **Only enable pins when every client runs a version with these codecs.** A future step is to gate this on `minVersionForCollab` ([§7.2](#72-format-gating)).
- With `enableSharedBranches` or `enableDetachedRootEditing`, those formats win and pins are unavailable (`setRevisionPreserved` throws `UsageError`; the shared-branches codec rejects pin messages).
- Storage layout is in [§4.5](#45-how-pins-are-stored).

## 7. Data-integrity risks

Severity uses the scale in [compaction §17](../DEV.md#17-data-integrity-risks-and-fixes).

### 7.1 Medium: rolling back a pin can diverge from other clients

**Where:** `SharedTreeCore.rollback` sets the preserved state to `!message.preserved`, whatever it was before.
If the original call changed nothing (pinning an already-pinned revision), rollback unpins a revision other clients still treat as pinned.

**Fix:** record the prior state in `localOpMetadata` at submit; restore it on rollback, or skip if the op was a no-op.

### 7.2 Format gating

The `history-compaction|v0.1` formats are selected by an explicit option, not `minVersionForCollab`.
An app that enables pins while older clients are in session sends ops and summaries they cannot read.
Fix: gate on `minVersionForCollab` before any production rollout (D7 in [§4.8](#48-proposed-a-better-pin-design)).
Tracked with the other format risks in [compaction §17.4](../DEV.md#174-watch-format-and-compatibility).

### 7.3 Invariants with no detection today

| Location | Risk |
| --- | --- |
| Summary decode of `preservedTrunkIndices` | An out-of-range index throws a plain `Error` (should be an assert or `UsageError` with a string message). |
| `applyStashedOp` | A stashed pin that is a no-op. |
| Summarizer-sent rejection ops | Fluid may start dropping or forbidding them. |

## 8. Telemetry

### 8.1 Implemented events

The aggregate `HistoryCompaction` event reports `preservedPairCount` (pairs skipped because a commit is pinned); see [compaction §18.1](../DEV.md#181-historycompaction).
The opt-in diagnostic trace also records preservation requests, queries, updates, op submission and processing, ignored requests, and rejections ([compaction §18.3](../DEV.md#183-opt-in-history-diagnostic-trace)).

| Event | Sent by | Fields |
| --- | --- | --- |
| `PreserveRevisionIgnored` | Any client that processes a pin for a revision it no longer has | `isSummarizer`, `rejectionSent` (only the summarizer sends one), `local` (whether the pin was this client's own) |
| `PreserveRevisionRejected` | Every client that processes a rejection op | `wasPreserved` (whether it raised the app event), `local` |

On an interactive client, `PreserveRevisionIgnored` with `rejectionSent: false` is harmless.
In the summarizer's logs it means a requested checkpoint was already gone.

The app event `revisionPreservationRejected` is the app-visible signal; telemetry is for operators.

### 8.2 Proposed events

**Not implemented.**

| Event | Emitted from | Fields | Detects |
| --- | --- | --- | --- |
| `PreserveRevision:RollbackStateUnknown` | `SharedTreeCore.rollback` | `preserved`, `priorState` | [§7.1](#71-medium-rolling-back-a-pin-can-diverge-from-other-clients) |
| `PreserveRevision:RejectionPendingAtSummary` | Summarizer, in `summarizeCore` | `pendingRejectionCount` (rejections sent but not yet sequenced) | Lost rejection on summarizer handoff ([§4.7](#47-op-leaks-and-lost-rejections)) |
| `PreserveRevision:DuplicateRejection` | `processPreserveRevisionRejection` | `local` (sent when the revision was not preserved and no pin for it is pending) | Duplicate rejections or app retry loops ([§4.7](#47-op-leaks-and-lost-rejections)) |
| `EditManagerSummary:PreservedIndexOutOfRange` | Summary decode | `index`, `trunkLength`, `formatVersion` | [§7.3](#73-invariants-with-no-detection-today) |

### 8.3 How to monitor a rollout

| Signal | Query | Healthy | Investigate |
| --- | --- | --- | --- |
| Pins blocking | `preservedPairCount` | Small | Large: many pins prevent compaction |
| Lost checkpoints | `PreserveRevisionIgnored` with `isSummarizer: true`; `PreserveRevisionRejected` with `wasPreserved: true` | Rare | Pinning too late; consider option 4 or metadata tags |
| Rejection delivery | `rejectionSent: true` not followed by `PreserveRevisionRejected` | Always followed | Summarizer ops dropped or forbidden, or lost on handoff ([§4.7](#47-op-leaks-and-lost-rejections)) |
| Retry loops | `PreserveRevisionRejected` count per document and session; `DuplicateRejection` (proposed) | Rare | App re-pins after rejection |

## 9. Tests and running

### 9.1 Unit tests

`packages/dds/tree/src/test/shared-tree/historyCompaction.spec.ts` (setup described in [compaction §21.1](../DEV.md#211-unit-tests-packagesddstreesrctestshared-treehistorycompactionspects)):

| Group | Tests | What it covers |
| --- | --- | --- |
| preserved revisions | never combines a preserved commit in either direction (positions); can be compacted again once it is no longer preserved; is shared with other clients; is honoured by the summary policy of another client and stored in the summary; is dropped when the retention limit removes the commit; when another client no longer has the revision (rejected by the summarizer…; can be preserved again after it is rejected…; is only logged by a client that is not the summarizer); cannot preserve a revision that is no longer in the history; keeps detached-root editing usable when revision preservation is also requested; requires enableRevisionPreservation | [§2](#2-api), [§4](#4-design) |

The staged pin/unpin walkthrough ([compaction §14.5](../DEV.md#145-staged-pinunpin-walkthrough)) checks compaction metadata around pins.
Pin round-trips are covered in the message and EditManager codec tests.

### 9.2 End-to-end tests

`packages/test/test-end-to-end-tests/src/test/treeHistoryCompaction.spec.ts`:

| Test | Shows |
| --- | --- |
| preserved revisions: is honoured by a real summarizer client | Middle pin blocks two pairs (`preservedPairCount: 2`); 2 removed; pin and metadata survive reload |
| preserved revisions: is honoured when requested while disconnected | Pin reaches the summarizer after reconnect |
| preserved revisions: is rejected by the summarizer when it already compacted the revision | Rule 4 end to end |

**Known gaps:**

- **Summarizer handoff.** No test closes a summarizer between a pin and its rejection being sequenced (§4.7), or switches summarizer clients mid-history.
- **Pins.** No e2e coverage of pin rollback (§7.1), stashed pins, or duplicate rejections.
- **Cross-version compatibility** of pin ops and summaries ([§7.2](#72-format-gating)).

### 9.3 How to run

From `packages/dds/tree`, after `npm run build:compile && npm run build:test:esm`:

```bash
# Pin unit tests
npx mocha --spec "lib/test/shared-tree/historyCompaction.spec.js" --fgrep "preserved revisions"

# Pin codec tests
npx mocha --fgrep "message codec"
npx mocha --fgrep "EditManager Codec"

# Logged staged pin/unpin walkthrough
FLUID_HISTORY_COMPACTION_WALKTHROUGH=1 npx mocha --fgrep "preserves old and newly sequenced revisions while compacting surrounding history"
```

End-to-end commands are in [compaction §23](../DEV.md#23-how-to-run-things); filter with `--grep 'preserved revisions'`.

## 10. Open questions

A proposed redesign covering most of these items is in [§4.8](#48-proposed-a-better-pin-design).

- Telling the app when its own client trimmed a pin.
- Whether the summarizer may keep sending rejection ops if Fluid forbids summarizer ops; option 4 is the fallback (D4).
- A rejection lost on summarizer handoff leaves a stale optimistic pin ([§4.7](#47-op-leaks-and-lost-rejections)); D5.
- Exact rollback (§7.1); D3.
- Gating by `minVersionForCollab`; D7.
- Pins with shared branches.
- Option P2 (pins hold trimming back).
- Point-in-time pin semantics (D6).

## Glossary

Shared terms (commit, revision, trunk, MSN, trimming, compaction) are in the [compaction glossary](../DEV.md#glossary).

| Term | Meaning |
| --- | --- |
| Pin / preserved revision | A revision marked with `setRevisionPreserved`; never combined in either direction. |
| `preservedTrunkIndices` | The summary field storing pins as positions in the summarized trunk. |
| Rejection | An op sent by the summarizer when it no longer has a pinned revision; every client treats it as an unpin. |
