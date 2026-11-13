# SharedTree history compaction — developer guide

This document is the single place to learn how application-guided history compaction works in SharedTree,
why it is built the way it is,
what has been measured,
and what is still open.

> Status: **experimental (`@alpha`)**.
> The API shape is not final.
> Implementation and tests continue while the API is discussed with application teams.
> Compaction (manual and summary-time) and pins (`setRevisionPreserved`, opt-in) are implemented and tested.
> The short, app-facing usage, telemetry, and prototype guide is in [APP_GUIDE.md](./APP_GUIDE.md).

## Contents

1. [What problem this solves](#1-what-problem-this-solves)
2. [Background: clients, summaries, and history](#2-background-clients-summaries-and-history)
3. [Design decisions and why](#3-design-decisions-and-why)
4. [The public API](#4-the-public-api)
5. [Architecture: why the code lives where it does](#5-architecture-why-the-code-lives-where-it-does)
6. [The algorithm](#6-the-algorithm)
7. [Change log: every file touched](#7-change-log-every-file-touched)
8. [Tests and coverage](#8-tests-and-coverage)
9. [Measurements: how much compaction saves](#9-measurements-how-much-compaction-saves)
10. [Local history vs. summarized history](#10-local-history-vs-summarized-history)
11. [Getting a policy into the summarizer: approaches](#11-getting-a-policy-into-the-summarizer-approaches)
12. [Open items](#12-open-items)
13. [How to run things](#13-how-to-run-things)
14. [Glossary](#14-glossary)
15. [Metadata before and after compaction](#15-metadata-before-and-after-compaction)

---

## 1. What problem this solves

SharedTree can keep its edit history beyond what collaboration needs.
This is turned on with the `retainHistory` option
(`true` keeps everything; a number keeps that many sequenced commits).
Applications use retained history for features like version history, activity feeds, and "restore to a point in time".

Kept history grows forever, one commit per edit.
Most applications do not need every intermediate state.
They need *some* points in time, for example "the end of each editing session" or "every save".

**History compaction** lets the application say which neighbouring commits may be merged.
Two merged commits become one commit with the same overall effect.
The state *between* them is lost, but every state the application cares about is kept.

SharedTree does not decide what matters.
The application decides, based on metadata that it attached to its own commits
(`runTransaction(..., { customMetadata })`).

## 2. Background: clients, summaries, and history

You need these ideas to understand the rest of the document.

### 2.1 Interactive clients and local history

An **interactive client** is an instance of the application that a user is working in.
It loads the document, shows it, and sends edits (ops).
Every interactive client keeps its own copy of the SharedTree in memory,
including its own copy of the edit history.

**Local** is not a separate client role.
It means "on this client instance."
An interactive client has local history, and so does the separate summarizer client.
Calling `requestCompaction` locally changes only the instance receiving that call.

Things that are only in one client's memory:

- unsent or unacknowledged local edits,
- local branches (forks) and their base commits,
- undo/redo stacks (revertibles) and the repair data they need,
- the result of any compaction that client ran.

Nothing in that list is shared with other clients.

### 2.2 Summarizer client

Fluid documents are not stored as an endless list of ops.
Periodically, one client writes a **summary**: a snapshot of the document that new clients load from.

The client that writes summaries is the **summarizer client**.
It is a separate, hidden client that the container runtime starts in the background
(it is elected; normally only one exists at a time).
It has no UI and no user.
It loads the document like any other client, processes ops, and writes a summary when the runtime asks it to.

Key consequence for compaction:
**what is saved in the summary is whatever is in the summarizer client's memory when it summarizes.**
The history inside a summary is the summarizer's history,
not the history of whichever interactive client happens to be editing.

A summarizer can also be replaced at any time (for example after a reconnect or a new election).
The new summarizer starts from the last summary plus the ops after it.
It has none of the previous summarizer's in-memory state.

### 2.3 Trunk, collaboration window, and the minimum sequence number

- The **trunk** is the sequenced (ordered by the service) list of commits on the main branch.
- The **minimum sequence number (MSN)** is the oldest sequence number that some client may still be basing new edits on.
- The **collaboration window** is the part of the trunk newer than the MSN.
  Commits in the window are still needed to rebase incoming edits and **must not be changed**.
- Commits older than the MSN are outside the window.
  Without `retainHistory`, SharedTree **trims** (drops) them.
  With `retainHistory`, it keeps them.
  These kept commits are the only ones compaction may touch.

### 2.4 Trimming vs. compaction

| | Trimming | Compaction |
| --- | --- | --- |
| What happens | Old commits are dropped from the start of history | Neighbouring commits are merged into one |
| What survives | Only the current state | The states the application chose to keep |
| Who decides | SharedTree, based on `retainHistory` and the MSN | The application, through a callback |
| Event | Emits `ancestryTrimmed` | Emits nothing (see [open items](#12-open-items)) |

## 3. Design decisions and why

| Decision | Reason | What the code does |
| --- | --- | --- |
| **Compaction belongs to the SharedTree, not a view or branch.** | History retention, trimming, and summaries belong to the whole DDS, not to one branch or view. | `ITreeAlpha.historyCompaction`. Removed from `TreeViewAlpha` / `TreeCheckout`. |
| **The application decides, using its own commit metadata.** | Apps already attach persisted custom metadata to commits. SharedTree should not interpret that metadata. | `CanCompactCommit` receives `current` and `target` with their metadata and returns `true`, `false`, or the combined commit's metadata. |
| **Decide pairwise, oldest first.** | Comparing the metadata of one commit with the metadata of the next is the simplest rule that can express "same session" or "same save". | The engine walks adjacent pairs; an accepted pair becomes the next `current`. |
| **Synchronous API.** | Nothing in the engine waits on I/O. An async signature implied a protocol that does not exist yet. | `requestCompaction(cb): number` (the number of commits removed). |
| **`requestCompaction` returns a number, not a result object.** | The only output is how many commits were removed. A wrapper object added an exported type with no extra value. | `requestCompaction(cb): number`. `CompactionResult` was removed. |
| **The pair is named `current` / `target`, not `before` / `after`.** | `before` / `after` read like times, not roles. `current` is the commit the policy is deciding about (it is removed if combined); `target` is where it goes. | `CanCompactCommit` receives `{ current, target }`. |
| **The policy receives `TreeBranchCommitMetadata`; there is no separate `CompactionCandidate` type.** | Apps already read commit metadata through `TreeBranchCommitMetadata` (history APIs). One type lets one helper serve both history browsing and compaction, and avoids duplicating `revision` / `custom` / `customTree` docs. | The kernel wraps trunk commits in `LazyTreeBranchCommitMetadata` (`shared-tree/history.ts`) with `revertTo` disabled. `CompactionCandidate` was removed. |
| **The policy cannot affect correctness, and the JSDoc says so.** | App authors need to know they only choose which points in time to keep. | The `CanCompactCommit` JSDoc lists every commit that is never offered as `current`. |
| **The JSDoc explains the API with a timeline, not just rules.** | App authors reason about "when does a commit become history only, and what do I see then". The worked example from the design discussion answers that directly. | The `CanCompactCommit` JSDoc walks through `A ← B ← C ← D ← E` ([§6.2](#62-walking-pairs)); a test pins down the same sequence. |
| **The policy may return the combined commit's metadata (option b, prototype).** | Only the app knows what its next decision needs from a combined commit (for example when a run started). SharedTree's default merge keeps the newest value and keeps every original commit's metadata, so time-window rules cannot bound a run and metadata grows. | `CanCompactCommit` returns `boolean \| JsonCompatibleReadOnlyObject`. An object becomes the combined commit's only metadata node; `true` keeps the default merge ([§12.4](#124-api-review-what-the-app-sees-and-what-it-may-need)). |
| **One function decides and shapes the metadata; there is no separate compose function.** | A separate `ComposeCommitMetadata` (option c) was prototyped and removed: two functions had to read the same pair the same way, and the meeting's direction is a single callback that can also say how the metadata is combined. How that callback should express the shape is still open ([§12.4](#how-the-app-could-tell-sharedtree-how-to-compose-the-metadata-investigation)). | `CanCompactCommit` is the only app callback. `requestCompaction(canCompactCommit)` takes one argument; `historyCompaction` has no `composeMetadata`. |
| **Pins (`setRevisionPreserved`) are shared through an op and stored in the summary.** | A pin only protects stored history if the summarizer knows about it. There is no API for editing an already-authored commit's metadata, so a later shared pin needs its own op. Compaction can separately rewrite retained metadata ([§15](#15-metadata-before-and-after-compaction)). | A new `preserveRevision` op and a `preservedTrunkIndices` summary field, behind the `enableRevisionPreservation` option ([§12.5](#125-preserved-revisions-setrevisionpreserved)). |
| **Pins are opt-in, under the same gate as compaction.** | They need a new op and summary format that older clients cannot read. Like shared branches, the format is unreleased. | `historyCompaction.enableRevisionPreservation: true` selects the `history-compaction\|v0.1` formats. Not supported together with shared branches or detached-root editing. |
| **Retention limit and compaction can be used together.** | Apps want a bounded history that is also compact. | `retainHistory: N` trims by count; compaction merges within what is kept. A compacted commit counts as one ([§4.2](#42-using-a-retention-limit-and-compaction-together)). |
| **The summarizer is what matters for storage.** | Only the summarizer's history is stored. Interactive clients have undo stacks and local branches that keep commits alive anyway, so compacting there gains little. | The `historyCompaction` factory option runs the policy in whichever client writes the summary, which is normally the summarizer ([§4.1](#41-running-the-policy-in-the-summarizer), [§11](#11-getting-a-policy-into-the-summarizer-approaches)). |
| **Policy is configured on the factory, not registered at runtime.** | The summarizer is built from the same container code and registry as every other client, so a factory option reaches it with no extra app code. | `SharedTreeOptions.historyCompaction.canCompactCommit`, run in `SharedTreeKernel.summarizeCore`. |
| **A faulty policy must not block summaries or break the tree.** | Summaries keep the document loadable; a policy bug should not stop them. | Policy errors are caught, logged, and end compaction; the summary is still written ([§12.3](#123-what-happens-if-the-callback-throws)). |
| **Never touch what collaboration or local state needs.** | Local branches and undo depend on old commits. Peers depend on the collaboration window. | Eligibility is capped by both the MSN and the oldest local fork base. |

### Why local compaction matters little

An interactive client's history lives only in its memory and disappears when the user closes the app.
It is not shared with anyone.
Its old commits are also often still in use by undo stacks or local branches.
So compacting on an interactive client saves little and risks breaking local features.

The summarizer's history is different.
It is written to storage and loaded by every future client.
That is where compaction pays off.

## 4. The public API

All types are `@alpha` and live in [`src/simple-tree/api/historyCompaction.ts`](../../src/simple-tree/api/historyCompaction.ts).

```typescript
interface ITreeAlpha {
	readonly historyCompaction: TreeHistoryCompaction;
}

interface TreeHistoryCompaction {
	requestCompaction(canCompactCommit: CanCompactCommit): number; // number of commits removed
	setRevisionPreserved(revision: CommitRevision, preserved: boolean): void; // needs enableRevisionPreservation
	isRevisionPreserved(revision: CommitRevision): boolean;
}

interface SummaryHistoryCompactionOptions { // SharedTreeOptions.historyCompaction
	readonly canCompactCommit?: CanCompactCommit; // runs before each summary
	readonly enableRevisionPreservation?: boolean; // turns on pins (new op and summary format)
}

type CanCompactCommit = (candidate: {
	readonly current: TreeBranchCommitMetadata; // older; removed if accepted
	readonly target: TreeBranchCommitMetadata; // newer; absorbs `current`
}) => boolean | JsonCompatibleReadOnlyObject; // false: keep both; true: combine; object: combine with this metadata
```

How the combined commit's metadata is chosen:

| Policy returns | Combined commit's metadata |
| --- | --- |
| `false` | Not combined. |
| `true` | Default merge: both originals as children, `custom` is newest-wins. |
| an object | The object replaces both commits' metadata (option b). |

`current` and `target` are the same `TreeBranchCommitMetadata` type that the history APIs return (`revision`, `custom`, `customTree`, `getParent()`, `revertTo`), with three differences:

- `revertTo` is always `undefined`. The policy must not edit the tree while its history is being rewritten.
- `getParent()` walks the tree's main history (the trunk), not a view's branch. It stops at the trunk base, so it only reaches older commits that are not yet trimmed. Commits already combined in this pass are not reachable.
- The objects are only valid during the call. Once the pass continues, `current` may no longer exist.

### Example

```typescript
const tree = asAlpha(sharedTree); // created with retainHistory: true

// Every edit in one editing session carries the same session ID.
view.runTransaction(() => { /* edit */ }, { customMetadata: { session: sessionId } });

// Later: keep one point in time per session.
const removedCount = tree.historyCompaction.requestCompaction(
	({ current, target }) =>
		current.custom?.session !== undefined && current.custom.session === target.custom?.session,
);
```

Returning the combined metadata, so that a run of edits is bounded by when it **started**
(each edit is authored with `customMetadata: { time }`):

```typescript
tree.historyCompaction.requestCompaction(({ current, target }) => {
	const start = current.custom?.start ?? current.custom?.time; // `start` exists once combined
	const time = target.custom?.time;
	if (typeof start !== "number" || typeof time !== "number") return false;
	return time - start < 5 * 60_000 ? { start, time } : false;
});
```

### Behaviour the API promises

- Only history kept because of `retainHistory` is considered.
  Without retained history, `requestCompaction` always returns `0`.
- **The policy cannot break correctness.** It only chooses which points in time to keep.
  SharedTree never offers, as `current`, a commit that is still needed to merge edits ([§6.1](#61-which-commits-are-eligible)):
  unsequenced local commits, commits in the collaboration window, commits that an open fork is based on (and later ones),
  the newest eligible commit, and preserved commits.
  The public `CanCompactCommit` JSDoc lists the same rules.
- Naming: `current` is the older commit, which is removed if combined; `target` is the next commit, which absorbs it and keeps its revision.
- Pairs are offered oldest first.
  If a pair is accepted, the next pair is *(merged commit, next commit)*, so a run of accepted pairs merges many commits into one.
- The merged commit keeps the **newer** commit's revision.
- When the policy returns `true`, metadata of merged commits is kept as a tree with both originals as children (oldest first).
  In the flattened `custom` view, the newer commit's values win on conflicting keys.
- When the policy returns an object, that object **replaces** the metadata of both commits.
  The combined commit's `custom` is the object and its `customTree` is `{ metadata: object, children: [] }`.
  The next question about this commit sees the object as `current.custom`.
  Anything other than a boolean or a JSON object (for example `null`) throws a `UsageError`.
- Compaction changes **only this client's** in-memory history.
  It is not sent to other clients.
  It reaches storage only if this client writes a summary.
- A **preserved** commit is never combined with an older or newer commit, on any client, including the summarizer.
  Its revision, change data, and metadata stay unchanged by compaction, and compaction cannot cross it.
  Pins are shared with every client; see [§12.5](#125-preserved-revisions-setrevisionpreserved).

### 4.1 Running the policy in the summarizer

Calling `requestCompaction` on an interactive client does not change what is stored ([§10.2](#102-what-the-tests-showed)).
To compact the stored history, configure the policy as a SharedTree option:

```typescript
interface SharedTreeOptions {
	readonly historyCompaction?: SummaryHistoryCompactionOptions;
}

interface SummaryHistoryCompactionOptions {
	readonly canCompactCommit?: CanCompactCommit;
	readonly enableRevisionPreservation?: boolean;
}
```

```typescript
const SharedTree = configuredSharedTree({
	retainHistory: true,
	minVersionForCollab: FluidClientVersion.v2_117, // persists the metadata the policy reads
	historyCompaction: {
		canCompactCommit: ({ current, target }) =>
			current.custom?.session !== undefined && current.custom.session === target.custom?.session,
	},
});
```

Every client uses the same factory, but the policy only runs when **that client enters the tree's `summarizeCore` hook**.
The runtime uses this hook for both summary generation and GC handle collection; see [§4.3](#43-observing-compaction-from-the-app).
In practice that means:

| Client | When the policy runs |
| --- | --- |
| Summarizer client | Right before each summary that includes this tree. |
| Interactive client | Only when it writes the attach summary of a tree that was created detached. Nothing is old enough to compact at that point, so this does nothing. |

What happens at summary time:

1. The runtime asks the tree for its summary (`summarizeCore`).
2. The kernel calls `runCompaction` with the configured policy, using the same rules as a manual call.
3. The kernel then writes the summary as usual. `getSummaryData` trims first, and the summary encodes the compacted trunk.

Things to know:

- **Compaction may wait for the next edit.**
  If no ops for this tree arrived since the last summary, the runtime reuses the previous summary handle and does not call `summarizeCore`.
  Compaction then waits until the tree has changed again.
  This only delays compaction; it never loses data.
- **Errors do not stop the summary.**
  If the policy throws, compaction stops, the merges made so far are kept, a `HistoryCompaction` error event is logged with `failureSource: "policy"`, and the summary is written.
- **Telemetry.**
  Every executed pass logs `HistoryCompaction`, including successful passes that remove nothing.
  Manual calls use the same event; see [§4.3](#43-observing-compaction-from-the-app).
- **The summarizer's in-memory history is compacted too.**
  That is fine: the summarizer has no user, undo stack, or local branches.
- **The policy must be fast.** It runs on the summarize path, once per eligible pair.

### 4.2 Using a retention limit and compaction together

An app can set both options.
For example, "keep the newest 1000 commits, and compact within those":

```typescript
const SharedTree = configuredSharedTree({
	retainHistory: 1000, // keep at most the newest 1000 sequenced commits (plus what collaboration needs)
	minVersionForCollab: FluidClientVersion.v2_117,
	historyCompaction: { canCompactCommit: sameSession },
});
```

The two options do different jobs:

| Option | Job | When it runs |
| --- | --- | --- |
| `retainHistory: N` | **Trimming.** Drops the oldest commits so that at most N remain. | Every time the MSN moves (so, continuously as ops arrive), and before each summary. |
| `historyCompaction` | **Compaction.** Merges neighbouring commits that the app allows. | Right before each summary (summarizer), or when the app calls `requestCompaction`. |

How they combine (verified by the tests "with a retention limit" in [§8.3](#83-behaviour-and-measurement-historycompactionspects-37-tests--3-opt-in)):

- **The limit counts commits that exist now.**
  A commit produced by compaction counts as **one**, however many edits it absorbed.
  So after compaction, the same limit of N covers more points in time and reaches further back.
- **Compaction only sees what trimming has kept.**
  It never brings back trimmed commits.
- **Trimming runs first and more often.**
  Trimming happens as soon as commits leave the collaboration window.
  Compaction happens later, at the next summary.
  New, not-yet-compacted commits therefore take up space in the limit, and can push older compacted points out before the next compaction.
  In practice, the limit holds about *N minus the number of commits made between two compactions* compacted points, plus the newer raw commits.
- **If more than N commits arrive between two summaries, compaction gains nothing for retention**:
  everything older than the newest N commits is trimmed before the policy runs.
  Pick N well above the number of commits expected between summaries.

Measured with N = 10, 8 rounds of 5 commits each (all 5 in a round share a group), compacting after each round:

| | Commits kept | Groups covered |
| --- | --- | --- |
| Without compaction | 10 | 2 (groups 6–7) |
| With compaction | 6 | 4 (groups 4–7) |

With compaction the history covers twice as many points in time, using fewer commits.
Group 3 and older were trimmed because each new round of 5 raw commits filled the limit before it was compacted.

**Possible improvement: compact before trimming.**
If a policy is configured, SharedTree could run it right before trimming by count, instead of only at summary time.
Then the limit would count compacted points only, and N would mean "the newest N points in time".
Costs: the policy would run much more often (every MSN change),
and it would also run on interactive clients, which brings in the undo/redo problem in [§12.1](#121-undoredo-and-repair-data-may-still-refer-to-a-removed-revision).
Not implemented; tracked in [§12.6](#126-smaller-items).

### 4.3 Observing compaction from the app

The tree sends one `HistoryCompaction` event through its existing Fluid telemetry logger for every executed pass.
Use the logger supplied when creating or loading the container to observe manual passes.
Configure telemetry for the summarizer too to observe its passes; an interactive client's local compaction does not stand in for the summarizer's work.
Fluid adds a namespace to event names, so match the `HistoryCompaction` suffix.
This is telemetry, not a new SharedTree event subscription or compaction callback.

| Field | Meaning |
| --- | --- |
| `trigger` | `"manual"` for `requestCompaction`; `"summary"` for the configured `summarizeCore` hook, including GC handle collection. This is the execution path, not the client role: a manual call on a summarizer still reports `"manual"`. |
| `status` | `"success"` or `"failure"`. |
| `failureSource` | `"policy"` for a thrown policy error or invalid return value; `"engine"` for an internal failure. Unset on success. |
| `durationMs` | Elapsed pass time, including policy execution, measured with a monotonic clock. Excludes summary encoding, upload, and acknowledgement. |
| `removedCount` | Number of completed compositions, including those before a later failure. Equals the return value of a successful manual call. |
| `policyCallCount` | Number of calls to the app policy, including the call that throws or returns an invalid value. |
| `rejectedPairCount` | Number of times the policy returned `false`. Excludes pinned or correctness-protected pairs and pairs skipped after a summary-policy failure. |
| `defaultMergeCount` | Completed compositions for which the policy returned `true`. |
| `replacementMergeCount` | Completed compositions for which the policy returned replacement metadata. |

`removedCount` equals `defaultMergeCount + replacementMergeCount`.
An approval is not counted as a merge until the engine finishes composing the pair.
`EditManager.compactHistory` reports each completed composition through an internal callback, forwarded by `SharedTreeCore.compactHistory`.
`SharedTreeKernel.runCompaction` owns the timer, policy-decision counters, error classification, and final event.
This keeps completed counts accurate even when a later callback throws.

Successful passes use the generic telemetry category; failed passes use the error category.
The event contains no commit revisions, custom metadata, document content, or raw exception messages or stacks.
In particular, app policy errors are not passed to the telemetry logger.
Manual errors still propagate; summary-policy errors still allow the summary to be written.
Telemetry does not change those error-handling rules.

A zero-removal event distinguishes **no policy calls** from **all offered pairs rejected**.
It does not explain why pairs were ineligible: no history, the collaboration window, open forks, and pins can all prevent policy calls.
If no summary policy is configured, or the runtime reuses a summary handle without calling the tree, no summary pass executes and no event is sent.
The event replaces the experimental `HistoryCompactionBeforeSummary` and `HistoryCompactionBeforeSummaryFailed` events.

For an app prototype, compare duration, removals, decisions, and failure rates across passes.
These counts are not byte or heap savings.
A `"summary"` event happens before the summary is encoded or uploaded; it does not prove that the compacted history reached storage.
Observe the runtime's summary acknowledgement separately.

**A summary can execute more than one pass.**
`SharedObject.processGCDataCore` calls `summarizeCore` to discover outbound handle references.
The actual summary calls it again.
The real-container test observes two `"summary"` events: the GC-time pass removes 36 commits, then the encoding-time pass removes zero.
This is existing hook behavior, now visible because zero-removal passes are logged.
Do not count these events as uploaded summaries, or deduplicate them by discarding zero-removal events.
Each event describes a separate pass; after a policy failure, a later pass may call the policy again.

The `telemetry` tests in `src/test/shared-tree/historyCompaction.spec.ts` cover manual and summary success, no eligible pairs, policy rejection, partial failure, and data exclusion.
The existing configured-policy end-to-end test also checks that a container logger receives events from both a real summarizer's automatic pass and an interactive client's manual pass.

## 5. Architecture: why the code lives where it does

SharedTree is split into layers.
Lower layers must not import higher ones (this is enforced by lint rules and the folder structure).

```text
simple-tree       public types: CanCompactCommit, TreeBranchCommitMetadata, ITreeAlpha
    │
shared-tree       SharedTreeKernel: wraps internal commits as TreeBranchCommitMetadata, supplies the revision replacer
    │
shared-tree-core  EditManager: eligibility, walking pairs, composing commits in place
    │
core              GraphCommit, ChangeRebaser.compose / changeRevision, RevisionReplacer type

feature-libraries (beside shared-tree-core, imports it): DefaultRevisionReplacer, modular change family
```

`feature-libraries` imports from `shared-tree-core`, so `shared-tree-core` cannot import from `feature-libraries`.

### Why each piece is placed where it is

- **Public types in `simple-tree`.**
  All public SharedTree API types are declared there.
  `ITreeAlpha` is in `simple-tree/api/tree.ts`, so `historyCompaction` sits next to `createSharedBranch` and similar tree-level APIs.

- **Wrapping commits as `TreeBranchCommitMetadata` in `SharedTreeKernel` (`shared-tree/sharedTree.ts`).**
  The kernel reuses `LazyTreeBranchCommitMetadata` from `shared-tree/history.ts` (the same class the history APIs use), passing a `getRevertTo` that always returns `undefined`.
  It exposes a stable revision string (`idCompressor.decompress`) and flattened metadata (`flattenCustomMetadata`).
  `shared-tree-core` does not know about simple-tree types or the public form of revisions,
  and stays generic over the change type.
  The kernel is the lowest layer that knows both sides.

- **The engine in `EditManager` (`shared-tree-core/editManager.ts`).**
  `EditManager` owns the trunk, the MSN, local fork tracking, retention, trimming, and the summary data.
  Every rule about which commits are safe to touch already lives there.
  Putting compaction anywhere else would duplicate those rules.

- **Composing in place in `SharedBranch.composeTrunkCommits`.**
  The shared branch owns the `sequenceIdToCommit` and `commitMetadata` maps that must be kept in sync.

- **The revision replacer is injected (`RevisionReplacerFactory`).**
  The composed change must be re-tagged to a single revision (see [§6.3](#63-re-tagging-the-merged-change)).
  The implementation (`DefaultRevisionReplacer`) is in `feature-libraries`, which `shared-tree-core` cannot import.
  So `EditManager.compactHistory` takes a factory, and the kernel passes
  `(updated, obsolete) => new DefaultRevisionReplacer(updated, obsolete)`.
  EditManager unit tests use a no-op replacer, because their test change type has no revisions to rewrite.

- **The summary-time hook in `SharedTreeKernel.summarizeCore` (`shared-tree/sharedTree.ts`).**
  `summarizeCore` is the method the runtime calls only when the summary is actually written, and only in the client writing it.
  The kernel already owns the options and the `requestCompaction` mapping, so the hook is a few lines there.
  The `SharedTreeCore` base class stays generic: it knows nothing about candidates or the public policy type.
  The policy is wrapped (`compactHistoryForSummary`) so that its errors never leave the kernel's breaker-wrapped methods.
  An error escaping one of those methods would mark the whole tree as broken.

- **The option on `SharedTreeOptions` (`shared-tree/sharedTree.ts`), its type in `simple-tree`.**
  `SharedTreeOptions` is where every factory-level setting lives (including `retainHistory`).
  `SummaryHistoryCompactionOptions` sits beside the other compaction types in `historyCompaction.ts`.
  `defaultSharedTreeOptions` uses `Required<Omit<…, "historyCompaction">>` because the option has no default.

- **Pins: storage in `EditManager`, op handling in `SharedTreeCore`, revision mapping in the kernel.**
  The preserved set must be trimmed together with the trunk and written in the same summary blob as the trunk,
  so it lives in `EditManager` (`preservedRevisions`, a `Set<RevisionTag>`).
  `SharedTreeCore` owns sending, processing, resubmitting, rolling back, and stashing ops, so the `preserveRevision` op is handled there.
  The kernel converts the public `CommitRevision` string to the internal `RevisionTag` (`idCompressor.tryRecompress`),
  checks the gate, and turns failures into `UsageError`s.
  Those two kernel methods use `@throwIfBroken` instead of the default breaking wrapper,
  so a usage error does not mark the tree as broken (the checks happen before any state changes).

- **Pin formats in new codec files (`*VHistoryCompaction.ts`).**
  Each new format wraps the matching `v7` codec, so commits are encoded exactly as before.
  The new codecs are always registered for reading, so any client on this version can read pin ops and summaries.
  They are only used for writing when `enableRevisionPreservation` is on (`resolveFormatOptions` in `treeFactory.ts`).

- **Not on the view or checkout.**
  The first version put `historyCompaction` on `TreeViewAlpha`.
  A view is one schema-typed window onto one branch.
  History retention, trimming, and summaries belong to the whole DDS, so the API was moved to the tree.

## 6. The algorithm

Code: `EditManager.compactHistory` and `SharedBranch.composeTrunkCommits` in [`editManager.ts`](../../src/shared-tree-core/editManager.ts).

### 6.1 Which commits are eligible

```text
trunk:  base ── c1 ── c2 ── c3 ── c4 │ c5 ── c6     (│ = MSN; c5 and c6 are in the collaboration window)
                                 ▲
                         newest eligible commit
```

1. Compute the upper bound as the **smaller** of:
   - the MSN bound (`{ sequenceNumber: msn, indexInBatch: ∞ }`), and
   - the oldest base commit of any local fork.
2. Find the newest trunk commit at or below that bound.
3. Eligible commits are the path from the trunk base to that commit.

Additional rules:

- The **trunk base** is never removed (`composeTrunkCommits` asserts `current.parent !== undefined`).
- The **newest eligible commit** can absorb older commits but is never removed.
  Commits after it (in the window) have it as their parent and depend on its output state.
- Unsequenced local commits are never on the trunk, so are never eligible.

### 6.2 Walking pairs

```text
for each adjacent pair (current, target), oldest first:
    if canCompact(current, target):
        compose current into target, in place
        (the next `current` is the merged `target`)
```

A pair whose `current` or `target` is preserved is skipped **without calling the policy** ([§12.5](#125-preserved-revisions-setrevisionpreserved)).

Because `target` is changed in place,
the next iteration naturally sees the merged commit as its `current`.
This lets a run of approvals merge many commits.

#### Worked example: what the policy is asked, and when

This is the example used in the design discussion.
It is checked by the test "offers each commit once it leaves the collaboration window, pairing a combined commit with the next one" ([§8.3](#83-behaviour-and-measurement-historycompactionspects-37-tests--3-opt-in)).

```text
1. A ← B ← C ← D ← HEAD          A, B, C: history only.  D: needed for correctness.
2. A ← B ← C ← D ← E ← HEAD      E is sequenced. D and E are both needed for correctness.
3. The MSN passes D.             D is now history only.
                                 Ask canCompactCommit({ current: C, target: D }):
                                   false → A ← B ← C ← D ← E
                                   true  → A ← B ← (C+D) ← E
4. F arrives; the MSN passes E.  E is now history only.
                                   after "true":  ask (C+D, E)
                                   after "false": ask (D, E)
```

Each commit becomes eligible when it leaves the collaboration window, so the window moves in step with the MSN.
If D and E leave the window together, the pass asks (C, D) first, then (C+D, E) if that was accepted, or (D, E) if it was not.

What the test shows that the example does not:

- **Declined pairs are asked again.**
  The engine does not remember earlier answers; each pass walks every eligible pair from the trunk base.
  In the test, (init, A) and (A, B) are asked on every pass.
  This is why the policy must be deterministic, and it costs one call per retained commit on every pass ([§12.4](#124-api-review-what-the-app-sees-and-what-it-may-need)).
- **The combined commit keeps the newer revision.**
  After (C, D) is combined, the next pass asks (B, D) and (D, E). `D` here is `(C+D)`.
- **The combined commit's `custom` only shows D's value** for a property both commits set.
  `customTree` still has both: `{ children: [{ metadata: { name: "C" } }, { metadata: { name: "D" } }] }`.

### 6.3 Re-tagging the merged change

`rebaser.compose([current, target])` returns a change that refers to **two** revisions.
Persisted commits must refer only to their own revision:
the summary encoder asserts this (`0x964` in the modular change codec).
Transactions satisfy this because all their steps share one revision.

The first implementation skipped this step,
and writing a summary then failed with assert `0x964`.
The fix: after composing, call
`rebaser.changeRevision(composed, replacer(target.revision, {current.revision, target.revision}))`
so the merged change refers only to `target.revision`.

### 6.4 Updating the trunk in place

`composeTrunkCommits(current, target)`:

1. Sets `target.change` to the re-tagged merged change.
2. Sets `target.customMetadata` to the object returned by the policy, as a single node `{ metadata, children: [] }`.
   If the policy returned `true`, uses `{ metadata: undefined, children: [currentMetadataTree, targetMetadataTree] }` instead
   (or just the one that exists, if only one has metadata).

   The choice is made in `decideCompaction`, a **module-level function** at the end of `src/shared-tree/sharedTree.ts`.
   It turns the app's answers into what the engine takes (`boolean | CustomMetadataTree`) and validates them.
   It is deliberately not a kernel method: every `SharedTreeKernel` method is wrapped by the breaker,
   so summary-policy errors must be caught inside the decision callback in `runCompaction`, before they leave a breaker-wrapped method.
   The first version, written as a method, failed the "policy throws" tests for exactly this reason.
3. Sets `target.parent = current.parent`, cutting `current` out of the chain.
4. Removes `current` from `sequenceIdToCommit` and `commitMetadata`.

`target` keeps its object identity, revision, and sequence ID.
Commits that point at `target` as their parent stay valid without changes.
This means retained metadata associated with that revision can change; see [§15](#15-metadata-before-and-after-compaction) for the distinction from authored metadata and the open contract question.

### 6.5 What compaction does **not** do

- It does not send an op, so other clients are unaffected.
- It does not emit `ancestryTrimmed`, so repair data for `current` is not released (see [§12.1](#121-undoredo-and-repair-data-may-still-refer-to-a-removed-revision)).
- It does not change the current tree state, only the history leading to it.

## 10. Local history vs. summarized history

### 10.1 What each client holds

| | Interactive client | Summarizer client |
| --- | --- | --- |
| Has a user, UI, undo stack | Yes | No |
| Has local branches | Often | No |
| Where its history lives | In memory only; lost on close | In memory, then written to the summary |
| Who loads its history later | Nobody | Every client that loads from that summary |
| Benefit of compaction | Lower memory in a long session | Smaller summaries, faster loads, and lower memory for **all** future clients |
| Risk of compaction | Breaking undo or local branches | Low; nothing local depends on its history |

### 10.2 What the tests showed

1. **Compaction is local.**
   Compacting on client A does not change client B's history.
   (`only affects the history of the client that compacts`)
2. **Only the summarizer's history is saved.**
   With real containers, an interactive client compacted its own history,
   but the summary written by the summarizer client still had the full history.
   (`compaction on an interactive client does not change what the summarizer writes`)
3. **A summarizer has everything it needs to apply the same policy.**
   A client loaded from that summary saw the same commits and the same persisted metadata,
   and compacted the grouped edits using only that metadata.
   (`a client loaded from a summary can compact using only persisted metadata`)
4. **Compaction in the summarizer is persisted and reloads correctly.**
   The end-to-end test `persists compaction done by the summarizer client and reloads from it`
   compacted inside a real summarizer client, uploaded the summary through a real driver,
   and loaded a new client from it.
   The summary was smaller, the content matched, and editing continued normally.
   This is direct evidence for Approach A in §11.
5. **The `historyCompaction` option compacts stored history with no extra app code.**
   With the option on the factory, the summarizer client compacted before writing,
   and interactive clients kept their own full history.
   (`the summarizer client compacts with the policy from the tree's options`, end to end)

Together: **running compaction on an interactive client does not reduce the summarizer's stored history.**
Storage only shrinks when the summarizer runs the policy, which the `historyCompaction` option does.

### 10.3 A freshly loaded client cannot compact yet

The MSN is not stored in the summary.
`EditManager` starts with the lowest possible MSN and learns the real value only from the ops it processes
(`SharedTreeCore.processMessagesCore` calls `advanceMinimumSequenceNumber`).

So right after loading, a client treats all loaded history as possibly inside the collaboration window, and nothing is eligible.
This is safe: it never compacts too much.

Effect on the summarizer design:
a new summarizer must process at least one op with a newer MSN before compaction can do anything.
Summarizers normally summarize only after processing ops, so this is usually fine.
But a policy that runs "right after load" would do nothing.

(`has nothing to compact on a client loaded from a summary until it processes ops`)

### 10.4 Real-container MSN gotcha (for tests)

With real containers, the summarizer client is part of the quorum.
The MSN does not move past an edit until every client, including the summarizer, has acknowledged it.
The real-container tests therefore make edits until
`container.deltaManager.minimumSequenceNumber` passes the last grouped edit,
then make one more edit so the tree processes an op carrying the new MSN.
`sharedTree.spec.ts` uses the same pattern.

### 10.5 Local, interactive, and summarizer clients in these tests

**Local** describes where an operation runs; **interactive** and **summarizer** describe client roles.
An interactive client is the app's client, with a user, UI, and possibly undo state and open branches.
The summarizer is a separate, non-interactive client that processes the same sequenced edits and writes summaries.
Both have their own local SharedTree history.
There are not three different compaction algorithms.

| Test setup | Clients and compaction trigger | What the result means |
| --- | --- | --- |
| Metadata, provenance, and pin/unpin tests in the tree unit package | Two connected mock clients from `TestTreeProviderLite`. One explicitly calls `requestCompaction`; neither is a dedicated summarizer. | Checks local compaction, metadata, eligibility, and shared pins. Calls to the `summarize` helper directly summarize the chosen tree; they test persistence, not a dedicated summarizer's lifecycle. |
| `per-client history and direct summaries` in the tree unit package | Mock client A compacts; B does not. Tests summarize A and B separately and reload each summary. | A's summary has compacted history; B's still has its original history. Compaction is not broadcast. Both continue collaborating with the same current content. |
| `policy configured to run when summarizing` in the tree unit package | A mock tree has `historyCompaction.canCompactCommit` configured. The test directly asks it to summarize. | The callback runs before that tree writes its summary. The other mock client does not compact merely because A summarized. |
| `telemetry` in the tree unit package | Manual requests and direct summaries run through a mock runtime's logger. | Each executed pass reports its trigger, decisions, completed merges, duration, and sanitized failures, including zero-removal passes and partial progress before an error. |
| Client-role and preservation tests in the end-to-end package | Real interactive containers and a separate summarizer client use `createSummarizer`, `summarizeNow`, and explicit summary versions. | Tests compaction in each role, shared pins, and loading from the summary actually uploaded by the summarizer. |
| `walks through session and timestamp compaction with logs` in the end-to-end package | Two interactive containers and a separate summarizer. An interactive client authors nested annotated edits; the test explicitly compacts the summarizer's tree twice. | Logs before/after metadata, proves both interactive histories stay unchanged, and verifies exact compacted revisions and metadata trees after summary upload and reload. |

The fast tests remain in `packages/dds/tree/src/test/shared-tree/historyCompaction.spec.ts`.
All real-container compaction tests now live in `packages/test/test-end-to-end-tests/src/test/treeHistoryCompaction.spec.ts`.
The former three real-container tests were consolidated into the equivalent end-to-end scenarios, preserving assertions on both compacted and uncompacted history counts.
The real-summarizer preservation test moved there too.

The end-to-end scenarios use different group sizes:

- **Interactive compaction:** three groups of five edits remove 12 commits locally; the summary and reloaded client retain the full history.
- **Summary-time policy:** four groups of ten edits remove 36 commits from the summarizer's history; an existing interactive client keeps its full history.
- **Loaded client:** two groups of five edits remove eight commits using only persisted metadata after the client learns the current MSN.
- **Pinned revision:** a middle pin in the first of two three-edit groups blocks both adjacent pairs; only the second group compacts, removing two commits. The pin and its original metadata survive summary reload.

The local driver uses an in-memory service but still runs real containers and a separate summarizer.
It is not the mock DDS runtime used by `TestTreeProviderLite`.
The same end-to-end suite can also run against Tinylicious or another configured service driver.

Every client uses the same eligibility and metadata rules.
The difference is whose local history changes and whether that history is written to storage.
Open local branches can further restrict an interactive client's eligible history.
Pins, unlike compaction itself, are shared through ops and stored in summaries, so the summarizer must honor them too.
Merely configuring a summary policy does not run compaction on every interactive client when another client summarizes.

## 11. Getting a policy into the summarizer: approaches

The problem:
the policy is a JavaScript function in the application's code.
The summarizer is a separate client.
It cannot call a function that lives in another client's memory.

The summarizer needs two things:

- **The data** the policy reads: commit metadata.
  This already works.
  Metadata is persisted when `minVersionForCollab >= 2.117`,
  and §10.2 shows a loaded client can read it.
- **The policy itself.**
  This is the open problem.

### Approach A — Register the policy in factory options (implemented)

```typescript
const factory = configuredSharedTree({
	retainHistory: true,
	historyCompaction: { canCompactCommit: myPolicy },
});
```

The summarizer is created from the same application code (the same container code and registry) as interactive clients,
so it gets the same factory and the same policy.
The kernel runs the policy just before writing a summary (in `summarizeCore`).

- ✅ Small change; reuses the existing API and engine.
- ✅ Runs exactly where storage is decided.
- ✅ No new ops or formats.
- ⚠️ Different app versions may have different policies; the summary reflects the summarizer's version.
  That is acceptable, because compaction does not need to match between clients.
- ⚠️ The policy must be fast and must not throw, because it runs during summarization.
- ⚠️ Needs the MSN to be known (§10.3); this is normally true at summary time.
- ⚠️ Compaction alone does not mark the tree as changed.
  The container runtime's summarizer node reuses the previous summary handle when no ops for this tree arrived since the last summary
  (`!fullTree && !hasChanged()` in `summarizerNode.ts`), and then `summarizeCore` is not called.
  The implementation accepts this: compaction is deferred until the tree next changes.
  New history only appears through ops, so anything newly eligible is normally picked up by the next summary that includes those ops.
  The one gap: commits that become eligible only because the MSN moved, with no further ops for this tree, wait for the next edit.
- ✅ Implemented: `SharedTreeOptions.historyCompaction` ([§4.1](#41-running-the-policy-in-the-summarizer)).
  Proven by unit tests and an end-to-end test with a real summarizer client ([§8](#8-tests-and-coverage)).

### Approach B — A "before summarize" hook

The tree exposes an event or hook (for example `tree.events.on("beforeSummarize", …)`).
The app registers it in its container code, and it runs in the summarizer.

- ✅ Flexible; the app can also decide *whether* to compact this time.
- ⚠️ Apps must know that their code runs in the summarizer and register it there; this is easy to get wrong.
- ⚠️ Event handlers that run during summarization are harder to reason about.

### Approach C — A compaction op that every client applies

A client sends a "compact up to revision X with rule R" op.
Every client, including the summarizer, applies it the same way.

- ✅ All clients' history stays the same.
- ✅ The request can come from any client, for example an admin action.
- ⚠️ Needs a new op type, a format, and versioning work.
- ⚠️ The rule must be data (not a function) so that it is applied the same way everywhere.
- ⚠️ Interactive clients would compact too, which is mostly unnecessary (§3) and can conflict with local undo.

### Approach D — A declarative policy stored in the document

The app saves a rule as data in the document (for example "merge commits with equal `custom.session`").
The summarizer reads and applies it.

- ✅ No app code needs to run in the summarizer.
- ✅ The rule travels with the document.
- ⚠️ Only rules that SharedTree knows how to express are possible.
- ⚠️ Needs a format and versioning for the rule.

### Approach E — Service-side or offline compaction

A service or tool loads the document, compacts, and writes a new summary.

- ✅ Does not affect live clients at all.
- ⚠️ Requires service work or special tooling.
- ⚠️ The summary must stay valid for clients that are connected at the time.

### Comparison

| | A: factory option | B: hook | C: op | D: stored rule | E: offline |
| --- | --- | --- | --- | --- | --- |
| Runs in the summarizer | Yes | Yes | Yes | Yes | N/A |
| Needs a new format | No | No | Yes | Yes | No |
| Arbitrary app logic | Yes | Yes | No | No | Yes |
| All clients agree | No (not needed) | No | Yes | Yes | N/A |
| Effort | Low | Low–medium | High | Medium–high | High |

**Path taken:**
**A** is implemented and tested end to end.
Consider **B** if apps need to decide per summary whether to compact, and **D** if they want rules that do not depend on code versions.
Approaches B–E remain options, not plans.

## 12. Open items

### 12.1 Undo/redo and repair data may still refer to a removed revision

When trimming drops commits, it emits `ancestryTrimmed`.
`TreeCheckout.onAncestryTrimmed` uses it to free repair data (removed content kept for undo) that was last touched by those revisions.

Compaction removes `current` but does not emit this event, and the merged commit uses `target`'s revision.
So:

- repair data last touched by `current` is never freed (a memory leak in long sessions), and
- a revertible created for `current` may later fail to find its revision.

**Context:**
local branches and undo stacks keep commits alive,
and interactive compaction gains little (§3), so this mostly affects interactive clients.

**Options:**
don't compact commits that still have live revertibles (similar to the fork bound);
move their repair data to `target`'s revision;
or only support compaction in the summarizer, which has no undo stack.

### 12.2 Summarizer flow: what remains

The summarizer flow exists: the `historyCompaction` option runs the policy before each summary ([§4.1](#41-running-the-policy-in-the-summarizer)).
Still open:

- **Deferred compaction.** If the tree has no new ops, the previous summary is reused and the policy does not run ([§11](#11-getting-a-policy-into-the-summarizer-approaches), Approach A).
  If this matters, the tree could mark itself as changed when it knows compaction has work to do.
  There is no API for a DDS to do that today without sending an op.
- **Policy versions.** Clients running different app versions may have different policies.
  The stored history reflects whichever version the summarizer runs.
- **Cost.** The policy runs on the summarize path; its cost has not been measured with large histories.
- **API review.** Is a factory option the right shape, compared with a hook (Approach B)?

#### Where compaction can run (verified)

A commit becoming history-only does not trigger compaction by itself.
Compaction runs only at two call sites:

| Trigger | Call site | Effect | Status |
| --- | --- | --- | --- |
| Summarization | `SharedTreeKernel.summarizeCore` → `compactHistoryForSummary` | Stored history (normally only the summarizer client summarizes) | Implemented |
| App call, any number of times | `historyCompaction.requestCompaction` → `runCompaction` | Calling client's memory | Implemented |
| Minimum sequence number advances | Would hook `EditManager.advanceMinimumSequenceNumber`, next to `trimHistory` | Every client's memory, continuously | Not implemented |

The third trigger would compact a commit as soon as it is no longer needed for correctness.
It is possible because trimming already runs there, but the minimum sequence number moves on almost every op, on every client,
so the policy would run on the op-processing hot path. Each pass walks all combinable history and re-asks declined pairs (Finding 4),
so it would need option **e** (ask each pair once) first. It mainly helps long-lived interactive clients, whose memory otherwise grows until they reload.
See [PROPOSAL.md §4](./PROPOSAL.md#4-when-compaction-happens).

### 12.3 What happens if the callback throws

**At summary time (the `historyCompaction` option):** decided.
The kernel wraps the policy.
On the first error, the wrapper records it and answers "do not combine" for every remaining pair, which ends compaction.
Merges already made are kept, the failure is logged as `HistoryCompaction` with `trigger: "summary"`, `status: "failure"`, `failureSource: "policy"`, and the partial `removedCount`,
and the summary is written.
The wrapper is needed: an error escaping a breaker-wrapped kernel method marks the whole tree as broken,
and every later use of the tree would fail. The first test of this path found exactly that.

**In a manual `requestCompaction` call:** still open.
The error propagates out of `requestCompaction`.
Pairs merged before the error **stay merged**, because each merge is applied in place immediately.
Each merge is complete before the next callback call, so the history stays consistent,
but the caller does not receive a removed count from the failed call.
The `HistoryCompaction` telemetry event reports the completed merges with `trigger: "manual"` and `status: "failure"`.
As before, an error escaping the breaker-wrapped methods marks the tree broken; telemetry does not recover the tree.

This is an implementation decision still to make.
It also passes through the kernel's breaker, so **the tree is put into a broken state**.
Options: catch the error the same way as the summary path and rethrow after compaction stops (and report the partial count);
or ask about all pairs first and merge afterwards (all or nothing).

### 12.4 API review: what the app sees, and what it may need

This section reviews the policy API against the worked example in [§6.2](#62-walking-pairs).
The question it tries to answer: given what we expose, can an app write a policy that makes the right decision at the right time?
The answers depend on the app, so each item ends with the question to ask app teams.
Option **b** (the policy returns the combined commit's metadata) is implemented as a prototype. Option **c** (a separate compose function) was prototyped and then removed in favour of a single callback; the rest is not implemented.

#### What the app sees today

The policy receives two `TreeBranchCommitMetadata` objects and returns a boolean or the combined commit's metadata.
For a commit that was already combined with `true` (the default merge):

| Field | Value for `(C+D)` | Consequence |
| --- | --- | --- |
| `revision` | D's revision | The point in time "right after D" still exists under the same name. The one "right after C" is gone. |
| `custom` | C's and D's metadata merged; D wins for a property both set | Equality rules ("same session") still work. Rules that need the **oldest** value (when a run started, the first author) see the newest value instead. |
| `customTree` | `{ metadata: undefined, children: [C's tree, D's tree] }` | Keeps everything, so a policy can recover any value. But it **grows by one leaf per original commit**, so the metadata is never compacted. |

The test in [§8.3](#83-behaviour-and-measurement-historycompactionspects-37-tests--3-opt-in) pins down these values.

#### Finding 1: merged metadata can mislead time-based rules

Take the rule "combine edits made within 5 minutes of each other" with `custom.time` on each commit.
After `(C+D)` is combined, `custom.time` is D's time.
The next question compares D's time with E's, so a steady stream of edits keeps growing one combined commit forever.
To bound the run, the policy needs C's time (the start of the run), which today is only in `customTree`.

C's metadata is **not erased**. Here is how the code handles it:

- `composeCustomMetadata` (`src/shared-tree-core/editManager.ts`) builds the combined commit's `customTree` as `{ metadata: undefined, children: [C's tree, D's tree] }`.
  If only one side has metadata, it keeps that side.
- `custom` is computed from `customTree` by `flattenCustomMetadata` (`src/core/rebase/types.ts`).
  Children are applied oldest first, so later values overwrite earlier ones.
  For a key both C and D set, `custom` shows D's value.
  Keys that only C set still appear in `custom`.

Evidence:

- The test "keeps every original commit's metadata in customTree, but custom only shows the newest values" ([§8.3](#83-behaviour-and-measurement-historycompactionspects-37-tests--3-opt-in)) combines A, B, C, each with `{ name, time }`.
  It checks three things:
  - `custom` is `{ name: "C", time: 2 }`, so A's start time is not visible there.
  - `customTree` still holds all three.
  - The same tree survives a summary and a reload.
- The worked-example test shows the same for (C+D): the next pass names the combined commit "D".
- The test "with the default merge, a rule that needs the start of a run cannot bound it" runs exactly this kind of rule: six edits within a short time of each other all combine into one, although the rule allows a run of 3 time units.

**Addressed by option b:** the policy returns `{ start, time }`, so the next question sees when the run started (see [the benefit analysis](#option-b-is-it-worth-letting-the-app-shape-the-metadata) below).

#### Finding 2: metadata is never compacted

The change data shrinks when commits combine, but `customTree` keeps one leaf per original commit.
For apps with small metadata this is negligible.
For apps with large metadata (for example a description per edit), compaction saves less than §9 suggests.

This follows from `composeCustomMetadata`, which wraps the two trees instead of merging them.
Every combination adds one level, and every original commit that had metadata stays a leaf.
Commits without metadata add nothing.
The test named under Finding 1 checks this: after combining A, B, C, the summary still holds `{ children: [{ children: [A, B] }, C] }`.

**Addressed by option b:** a returned object replaces both trees, so the combined commit has one metadata node however many commits it absorbed.

#### Finding 3: "was this commit combined?" is not reliably visible

A combined commit's `customTree` has children and no metadata of its own.
A single commit made by nested transactions can look the same.
SharedTree knows it is composing a pair while executing that step, but does not store a dedicated `isCompacted` flag on the resulting commit.
Adding a reliable flag or count would require explicitly tracking and exposing it.
With the default `true` return, the app cannot add a marker after authoring: there is no metadata-editing API.

Example: an outer transaction with no metadata that runs two nested transactions annotated `X` and `Y` produces **one** commit:
`{ metadata: undefined, children: [{ metadata: X }, { metadata: Y }] }`
(built in `src/shared-tree-core/transaction.ts`; see the test "include a node for an unannotated transaction that contains an annotated one" in `customCommitMetadata.spec.ts`).
Combining a commit annotated `X` with one annotated `Y` produces the same shape.
So "`customTree` has children" does not mean "this commit was combined".
The test **cannot distinguish default-compacted metadata from a nested transaction** verifies this ambiguity, the next callback's behavior, and summary reload ([§15.6](#156-can-true-identify-a-compacted-commit)).

**Partly addressed by option b:** the app still cannot directly edit an authored commit's metadata, but it can return replacement metadata at the moment of combining.
So it can record that fact itself, for example `{ ..., count: (current.custom.count ?? 1) + 1 }`.
This rewrites the retained entry under the newer revision; it does not provide strict metadata immutability per revision ([§15](#15-metadata-before-and-after-compaction)).

#### Finding 4: declined pairs are asked again on every pass

Each pass walks every eligible pair from the trunk base and does not remember earlier answers ([§6.2](#62-walking-pairs)).
The design discussion assumed a commit is asked about once, when it leaves the collaboration window.
Asking again is correct for a deterministic policy, but costs one call per retained commit on each summary, and it surprises app authors who log or count calls.

**What happens today.**
`EditManager.compactHistory` computes the newest eligible commit, then walks `getPathFromBase(newestEligible, trunkBase)` from the first pair.
It keeps no state between passes.
Any pair that is still two separate commits (because the policy declined it, or because a pin protected it) is offered again on the next pass.
In the worked-example test, (init, A) and (A, B) are asked on all four passes.

**What the design discussion assumed.**
Each commit is offered once, at the moment every client has seen it (when the minimum sequence number passes it), and the answer is final.
The policy would then see a stream of "new" questions in time order.

**Why it differs.**
Remembering answers needs state.
That state would have to be persisted (or the first pass after load asks everything again anyway) and kept correct when pins change.
The first version chose no state, which is simpler and always correct if the policy gives the same answer for the same pair.

**Consequences for app authors.**

- The policy must be deterministic and must not depend on the current time, the number of calls, or other outside state.
  Otherwise an earlier "no" can become a "yes" later.
- The cost is one call per retained commit per pass, not one per new commit.
  With `retainHistory` set, the number of retained commits is bounded, so the cost is bounded as well.
- A declined pair may later be combined anyway, if the answer for that pair changes.
  For example, removing a pin makes the pair around it eligible again.

**Possible fix.** Option e below remembers where the last pass stopped and starts the next pass there.
Removing a pin would need to re-offer the pairs around it, and a freshly loaded client would ask everything once.

#### Option b: is it worth letting the app shape the metadata?

Status: **prototype implemented.** `CanCompactCommit` returns `boolean | JsonCompatibleReadOnlyObject`.

**How the app tells SharedTree the shape.**
At the moment SharedTree asks about a pair, the policy already has both commits' metadata in hand.
It returns one of:

| Return | Effect on history | Combined commit's metadata |
| --- | --- | --- |
| `false` | Both points in time are kept. | Unchanged. |
| `true` | Combined. | Default merge: `customTree` is `{ children: [current, target] }`, `custom` is newest-wins. |
| an object | Combined. | Exactly that object: `custom` is the object, `customTree` is `{ metadata: object, children: [] }`. |

There is no separate schema or registration: the shape is whatever the app returns, and it may differ from the shape the app attaches when authoring.
The only rules are the ones every piece of commit metadata already follows: JSON-compatible, and (because it runs on the summarizer) computed only from `current` and `target`.

**Is it beneficial when deciding about the next commit (E)?**
Yes, for any rule that depends on the run as a whole rather than on the last edit.
The question about `(C+D, E)` is answered from `current.custom`.
With `true`, that is D's metadata, so the policy has lost what it knew about C.
With a returned object, it is whatever the policy decided to carry forward from C and D.
The tests in [§8.3](#83-behaviour-and-measurement-historycompactionspects-37-tests--3-opt-in) show this with the rule "combine edits within 3 time units of the run's start", on six edits at times 0 to 5:

| | `true` (default merge) | Returning `{ start, time }` |
| --- | --- | --- |
| Question about edit 3 sees | `{ time: 2 }`, so 3 − 2 < 3 → combine | `{ start: 0, time: 2 }`, so 3 − 0 ≥ 3 → keep |
| Result | One commit for all six edits | Two commits: edits 0–2 and edits 3–5 |
| Stored metadata of each combined commit | A tree with one leaf per original edit | One node |

Kinds of rule and whether they benefit:

- **Equality rules** ("same session", "same save"): no benefit. Newest-wins already carries the shared value forward, so `true` is enough.
- **Rules about the start of a run** (time window, maximum duration): benefit. They need a value from the oldest commit, which `custom` hides.
- **Rules about size** ("at most 20 edits per point in time"): benefit. The app carries a `count`; nothing in today's metadata counts commits reliably (Finding 3).
- **History UI labels** ("5 edits by Ana and Ben"): benefit. The app keeps a summary such as `{ authors, count }` instead of one leaf per edit.
- **Apps with large per-edit metadata**: benefit for storage (Finding 2). The app chooses what survives.

**Costs and limits.**

- **The original metadata is gone once replaced.** If the app returns `{ start, time }`, C's other properties are no longer available on that commit, including in the summary.
  This is the point (Finding 2), but it is the app's choice and cannot be undone.
- **The authored metadata must carry the seed.** The first combination only sees what was attached when authoring, so each edit must already have, for example, `time`.
  The policy has to handle both shapes: an uncombined commit (`{ time }`) and a combined one (`{ start, time }`), as the example in [§4](#4-the-public-api) does.
- **Determinism matters more.** Declined pairs are asked again (Finding 4), and a returned object is stored. If the result depends on anything other than `current` and `target`, the stored history depends on when summaries ran.
- **Only the top level is checked.** SharedTree rejects non-objects (`UsageError`) but does not deep-validate JSON compatibility or copy the object. A non-JSON value inside it would fail when the summary is encoded. The app should not mutate the object after returning it.
- **A mixed return type** (`true` or an object) is less obvious than two functions. A separate function (option c) was tried and removed; see [the investigation below](#how-the-app-could-tell-sharedtree-how-to-compose-the-metadata-investigation) for other ways one callback can say how to combine.
- **Pins:** a preserved commit is never offered as `current` or `target`, so the policy cannot replace its metadata.
  Unpinned commits on either side can still combine, but cannot combine across it.

#### How the app could tell SharedTree how to compose the metadata (investigation)

Status: **investigated, not decided.** Option c (a separate `ComposeCommitMetadata` function) was removed so that one callback both decides and says how to combine.
This subsection records what the design discussion meant by "we already have a way of composing metadata trees", and how a single `CanCompactCommit` could use it.

**The existing mechanism.**

- `CustomMetadataTree` ([`src/core/rebase/types.ts`](../../src/core/rebase/types.ts)) is already public (`@sealed @alpha`) and is what apps read as `TreeBranchCommitMetadata.customTree`.
- Nested transactions build it ([`src/shared-tree-core/transaction.ts`](../../src/shared-tree-core/transaction.ts)): the outer transaction's `customMetadata` is the root node, and each nested transaction adds a child. The one squashed commit carries the whole tree.
- `flattenCustomMetadata` (same file as the type) produces `custom`. It visits children first, so **the outer node's values win over its children**, and a later sibling wins over an earlier one.
- Compaction's default (`composeCustomMetadata` in [`src/shared-tree-core/editManager.ts`](../../src/shared-tree-core/editManager.ts)) builds `{ metadata: undefined, children: [current, target] }`.

So, to the app, a combined commit already looks like C and D wrapped in an outer transaction that supplied no metadata.
The tree has a slot that the default leaves empty: **the outer node's metadata.**
Filling that slot is the natural way for the app to say how it wants the metadata combined, and it is exactly how nested transactions already work.

**The shapes one callback can produce,** on the example in [PROPOSAL.md §1](./PROPOSAL.md#1-goal) (C = `{ user: "ana", time: 30 }`, D = `{ user: "ana", time: 34 }`, E = `{ user: "ana", time: 42 }`; rule: one burst per user, at most 10 minutes from its first edit):

| Shape | `customTree` of (C+D) | `custom` of (C+D) | Question about (C+D, E) | Per-edit metadata kept | Stored metadata per combination |
| --- | --- | --- | --- | --- | --- |
| Default (`true`) | `{ metadata: undefined, children: [C, D] }` | `{ user: "ana", time: 34 }` | 42 − 34 < 10: combine (wrong) | Yes | Grows |
| **Outer node** (not implemented) | `{ metadata: { start: 30 }, children: [C, D] }` | `{ user: "ana", time: 34, start: 30 }` | 42 − 30 ≥ 10: keep | Yes | Grows by one small node |
| Replace (option b, implemented) | `{ metadata: { user: "ana", start: 30, time: 34 }, children: [] }` | the same object | 42 − 30 ≥ 10: keep | No | One node |

With the outer node, the app returns only the properties it wants to add or override; everything else is still the default newest-wins merge.
The outer node keeps working on later combinations: if (C+D) is later combined with a next commit X using `true`, the tree is `{ undefined, [{ { start: 30 }, [C, D] }, X] }`, and `custom` has X's `time` with `start: 30` still there.
The caveat is the same as for nested transactions: a property the app puts in the outer node hides the children's value of that property in `custom` (it is still in `customTree`).

**How a single `CanCompactCommit` could say which shape it wants.**
These are the candidate return types:

| | Return type | An object means | Good | Bad |
| --- | --- | --- | --- | --- |
| 1 | `boolean \| JsonCompatibleReadOnlyObject` | The **outer node's** metadata; the originals stay as children | Smallest API. Same rule as nested transactions. Nothing is lost, and the app returns only what its next decision needs. | Metadata still grows (Finding 2). Combined commits still look like nested transactions (Finding 3). |
| 2 | `boolean \| JsonCompatibleReadOnlyObject` | The **replacement** (today's prototype, option b) | Metadata shrinks to one node. | The originals are lost for good. A change in meaning from 1 with the same type. |
| 3 | `boolean \| { metadata: JsonCompatibleReadOnlyObject; keepOriginals: boolean }` | Outer node or replacement, chosen per pair | Explicit. Supports both needs. | One more concept. |
| 4 | `boolean \| CustomMetadataTree` | The combined commit's whole metadata tree | Most flexible, and uses the exact type the discussion referred to. The outer node is `{ metadata: x, children: [current.customTree, target.customTree] }`; a replacement is `{ metadata: x, children: [] }`. | `CustomMetadataTree` is `@sealed`, so apps would need an input type or the tag removed. SharedTree must validate every node. `customTree` is `undefined` for commits with no metadata, so the app must filter those. Easy to build a tree that does not describe the commits (for example, dropping `current`). |

Shape 1 in code:

```typescript
const canCompactCommit: CanCompactCommit = ({ current, target }) => {
	const start = Number(current.custom?.start ?? current.custom?.time);
	if (current.custom?.user !== target.custom?.user || Number(target.custom?.time) - start >= 10) return false;
	return { start }; // becomes the outer node; C's and D's own metadata stay as its children
};
```

Shape 4 in code, for the same rule:

```typescript
return {
	metadata: { start },
	children: [current.customTree, target.customTree].filter((t) => t !== undefined),
};
```

**The design discussion's concerns.**

- *"If the app supplies metadata for a compaction SharedTree cannot carry out, the metadata is inconsistent."*
  This cannot happen with any shape: the callback is only asked about pairs that SharedTree can combine (commits in the collaboration window, under a fork, pinned, or the newest eligible one are never offered as `current`, see [§6.1](#61-which-commits-are-eligible)), and the returned metadata is applied in the same step as the combination.
- *"Keep the original metadata if the merge fails."* Shapes 1, 3 (with `keepOriginals`) and 4 (with the originals as children) keep it by construction.
- *"Apps want to survey everything."* This is about which commits the app sees (option f), not about the return shape. Any of the shapes works for a whole-history API, with one return value per group.

**What changes to implement each.**
All four reuse the engine as it is: `EditManager.compactHistory` already accepts `boolean | CustomMetadataTree`, and `composeTrunkCommits` already takes the combined tree.
Only `decideCompaction` in [`src/shared-tree/sharedTree.ts`](../../src/shared-tree/sharedTree.ts) and the public type change.
Shape 1 is a one-line change (`children: [current tree, target tree]` instead of `[]`); shape 4 also needs a validator and an input type.

**To ask app teams:** after combining, do you need each edit's own metadata (choose 1, 3 or 4), or only a summary (choose 2)? Would you rather return a few properties (1–3) or build the tree (4)?

#### Options

The design discussion named four ways to choose a combined commit's metadata.
They map to the options below, and [PROPOSAL.md §2–3](./PROPOSAL.md#2-api-alternatives) runs each one on the A ← B ← C ← D ← E ← F timeline:

| Alternative from the discussion | Option | Status |
| --- | --- | --- |
| 1. SharedTree merges with its existing metadata-tree merge ("we can provide a default way") | **a** | Implemented (`true`) |
| 2. The predicate returns the compacted metadata, `false` otherwise | **b** | Prototyped |
| 3. A separate API: "please compose these two metadata sets for us" | **c** | Prototyped, then removed |
| 4. Give the app the range of original commits rather than merged metadata | **f** (a run passed to a pairwise predicate is its smallest form) | Not implemented |

| | Option | What changes for the app | Trade-offs |
| --- | --- | --- | --- |
| **a** | Keep today's API (boolean, SharedTree merges metadata) | Nothing | Simplest. Findings 1 to 4 remain; apps must read `customTree` for oldest values. |
| **b** (prototype implemented) | The policy returns the merged metadata, or `false` to decline (`true` keeps the default merge) | `CanCompactCommit` returns `boolean \| JsonCompatibleReadOnlyObject` | Fixes Findings 1 and 2: the app stores exactly what it needs (for example `{ session, start, end, count }`) and the combined commit's `customTree` becomes a single node. Decide and merge happen in one call, so they cannot disagree. The return value is persisted, so it must be JSON-compatible and deterministic. Mixing `true` and an object in one return type is less obvious to read. |
| **c** (prototyped, removed) | A separate `composeMetadata({ current, target })` function next to `canCompactCommit` | A second optional function | Same benefits as **b**, but two functions must read the pair the same way. Removed in favour of one callback; [the investigation](#how-the-app-could-tell-sharedtree-how-to-compose-the-metadata-investigation) lists how one callback can say how to combine. |
| **d** | Expose "combined" information (for example `combinedCount` on the metadata) | A new read-only field | Fixes Finding 3. Small and independent of a–c. Only worth it if apps need it. |
| **e** | Ask each pair once (remember where the last pass stopped) | No API change; fewer calls | Fixes Finding 4. The pass would start at the previous newest eligible commit. Needs care when a pin is removed (pairs before it must be asked again) and after load (the first pass asks everything once). |
| **f** | Whole-history or range policy ([PROPOSAL.md §2.3](./PROPOSAL.md#23-whole-history-at-once-not-implemented)) | The app gets the list of eligible commits and returns groups | Handles rules that need context wider than two neighbours. More app code; SharedTree must validate the groups. |

#### Recommendation

1. **Prototype b** (return merged metadata) behind the existing alpha API. **Done**; see [the benefit analysis](#option-b-is-it-worth-letting-the-app-shape-the-metadata).
   It answers Findings 1 and 2 with no new function, and the default (`true`) keeps today's behaviour, so existing policies keep working.
   **c** was prototyped and removed: one callback is clearer. What is still open is what a returned object means:
   the outer node of the metadata tree (keeping the originals), a replacement (today), or a tree the app builds.
   See [the investigation](#how-the-app-could-tell-sharedtree-how-to-compose-the-metadata-investigation).
2. **Do e** independently: it is internal and matches the model app authors already expect.
3. **Hold d and f** until an app asks for them.
4. Before building any of these, **prototype a policy with a real app's metadata**:
   which metadata the app attaches while editing, and whether a pairwise callback with that metadata gives the history the app wants.
   The A–F example in [PROPOSAL.md §1](./PROPOSAL.md#1-goal) is the starting point.

#### Questions for app teams

1. **What metadata do you attach to each edit today, and how large is it?** (session ID, user, time, a description?)
2. **After commits are combined, do you need each original commit's metadata, or one merged value?** If merged, how should conflicts merge (newest wins, oldest wins, range, list, count)?
3. **Would you merge the metadata yourself, and should the original per-edit metadata be kept underneath what you return (outer node) or replaced by it?** What would your combined metadata look like (for example `{ session, start, end, count, authors }`)? Can that merge be deterministic and side-effect free, given it runs on the summarizer? Is losing the original per-edit metadata acceptable?
4. **Do you need to know that a point in time is the result of combining** (d), for example to show "5 edits" in a history UI?
5. **Is comparing two neighbours enough**, or do your rules need wider context such as "one point per day for the last 30 days" (f)?
6. **Is it a problem that the policy may be asked about the same pair more than once** (Finding 4)?
7. **What should happen to undo/redo for a point in time that was combined away** ([§12.1](#121-undoredo-and-repair-data-may-still-refer-to-a-removed-revision))?

### 12.5 Preserved revisions (`setRevisionPreserved`)

Status: **implemented (`@alpha`), opt-in.**
Turn it on with `historyCompaction.enableRevisionPreservation: true`.
This section records the rules, how pins are stored, and what is still open.

#### What it is for

An app wants to keep a specific point in time restorable, even if its compaction policy would otherwise merge it away.
Examples: a version the user named, a published version, a point before a risky bulk edit.
"Preserved" means: **the document state right after revision R stays restorable, under the same revision.**

#### API

```typescript
const factory = configuredSharedTree({
	retainHistory: 1000, // pins and a retention limit can be used together
	historyCompaction: { canCompactCommit: sameSession, enableRevisionPreservation: true },
}).getFactory();

const compaction = asAlpha(tree).historyCompaction;
compaction.setRevisionPreserved(revision, true); // pin (sent to every client)
compaction.isRevisionPreserved(revision); // true once this client has processed the pin
compaction.setRevisionPreserved(revision, false); // unpin
```

`setRevisionPreserved` throws a `UsageError` when:

- `enableRevisionPreservation` is not on, or shared branches or detached-root editing is enabled;
- pinning a revision this client does not know;
- pinning a revision that is not in the main branch's history any more (it was trimmed or compacted away).

Unpinning an unknown revision does nothing.
These errors do not break the tree (the kernel methods use `@throwIfBroken`).

#### Rule 1: interaction with compaction

```text
history:   A1 ─ A2 ─ [A3] ─ A4 ─ A5      ([A3] is preserved; the policy says "yes" to every pair)

(A1, A2)   → combine            → A2'
(A2', A3)  → skipped            →       A3 cannot absorb older commits
(A3, A4)   → skipped            →       A3 cannot merge into newer commits
(A4, A5)   → combine            → A5'

result:    A2' ─ [A3] ─ A5'              A3 keeps its original change data and metadata
```

- A preserved commit is **neither `current` nor `target`** of a merge.
- Its change data and full metadata tree remain unchanged by compaction.
- Other commits can combine on either side, but cannot combine across the preserved commit.
- The engine skips those pairs **before** calling the policy.
  Preservation is a guarantee, not a hint the policy can ignore.
- A merge keeps `target`'s revision, so a preserved revision is **never renamed**.

Code: `EditManager.compactHistory` skips a pair if `preservedRevisions` contains either revision, before invoking `canCompact`.

#### Rule 2: interaction with trimming and `retainHistory` (option P1)

Pins **only protect against compaction**.
Trimming still applies: a preserved commit counts toward `retainHistory: N` like any other commit.
When it falls outside the limit it is trimmed, and its pin is dropped (`EditManager.trimHistory` removes it from the set).

Why:

- `retainHistory` stays the one setting that bounds memory and storage.
- Apps that need pins to live forever can use `retainHistory: true`.
- Letting pins hold trimming back (option P2) can be added later as an opt-in without changing this behaviour.

Not yet done: telling the app that a pin was dropped. Today it can only check `isRevisionPreserved`.

#### Rule 3: pins are shared (option S3)

Stored history is compacted by the **summarizer**, so a pin kept only in the user's client would not protect it.
`setRevisionPreserved` therefore sends an op, and every client (including the summarizer) applies it when it is sequenced.

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

- The pin is applied locally right away, so the calling client honours it before the op round-trips.
  When the op comes back, applying it again does nothing.
- Every client applies the same pin ops in the same order, so all clients agree on the preserved set
  for the commits they still have.
- A pin can be set on a local commit that is not sequenced yet.
  The pin op is sent after the commit op, so the commit is in the trunk before any other client applies the pin.

#### Where the pin is stored

A commit cannot hold the pin.
`customMetadata` is set when the commit is made and never changes,
and the summary stores each commit as `{ revision, sessionId, change, customMetadata?, sequenceNumber }`.
So pins are stored **next to** the commits:

```text
EditManager summary (v7)               EditManager summary (history-compaction|v0.1)
  trunk:    [c0, c1, c2, c3]             trunk:                 [c0, c1, c2, c3]   ← unchanged
  branches: [...]                        branches:              [...]
                                         preservedTrunkIndices: [1, 3]            ← new: c1 and c3 are pinned
```

| Where | Form | Code |
| --- | --- | --- |
| Memory | `Set<RevisionTag>` in `EditManager` | `editManager.ts`: `preservedRevisions` |
| Op | `{ version, type: "preserveRevision", originatorId, revision, preserved }`. The revision is encoded relative to `originatorId`, like a commit's revision. | `messageFormatVHistoryCompaction.ts`, `messageCodecVHistoryCompaction.ts` |
| Summary | `preservedTrunkIndices`: positions in the summary's `trunk` array | `editManagerFormatVHistoryCompaction.ts`, `editManagerCodecsVHistoryCompaction.ts` |

Why trunk **indices** and not revisions:
the trunk is in the same blob, so an index is shorter, needs no ID-compressor encoding,
and cannot point at a commit that is not in the summary.
Only pins whose commit is in the summarized trunk are written; a decoded index outside the trunk is an error.
An empty list is read back as "no pins".

#### Format and gating

| | Without `enableRevisionPreservation` | With it |
| --- | --- | --- |
| Op format written | v7 (unchanged) | `history-compaction\|v0.1` |
| Summary format written | v7 (unchanged) | `history-compaction\|v0.1` |
| Can read the new formats | Yes (codecs are always registered) | Yes |
| `setRevisionPreserved` | Throws `UsageError` | Works |

- The option sets write-version overrides for the message and EditManager codecs (`resolveFormatOptions` in `treeFactory.ts`),
  with `allowPossiblyIncompatibleWriteVersionOverrides`, the same mechanism shared branches use.
- Clients from **older releases cannot read** the new formats.
  Only turn the option on when every client runs a version that has these codecs.
  A future step is to tie it to a `minVersionForCollab` value once the format is released.
- **Shared branches:** if `enableSharedBranches` is also on, the shared-branches formats win and pins are not available.
  The shared-branches op codec rejects pin messages.
  Shared branches are experimental, so this is accepted for now.
- **Detached-root editing:** if `enableDetachedRootEditing` is also on, its formats similarly take priority and pins are not available.
  Both detached-root and history-compaction codecs remain registered for reading.
  `setRevisionPreserved` throws `UsageError` without breaking the tree; a regression test in `historyCompaction.spec.ts` verifies that subsequent edits still work.

#### Edge cases and decisions

| Case | Behaviour |
| --- | --- |
| **Race with compaction.** A client pins R, but another client (for example the summarizer) compacts R away before it processes the pin op. | That client ignores the pin (R is not in its history). The stored history does not have R. The calling client is not told. To avoid this, pin soon after the commit is made, or tag the commit with metadata when it is made and check the tag in the policy. |
| Pin op for a commit this client already trimmed | Ignored. |
| Resubmit after reconnect | The op is sent again unchanged. |
| Rollback (for example, an abandoned transaction) | Approximate: the opposite pin is applied locally. If the revision was already pinned before, rollback of a second pin unpins it. |
| Stashed ops | The pin is re-applied locally when the stashed op is loaded. |
| Detached tree | No op is sent, but the local set is written in the attach summary. |
| Result reporting | `setRevisionPreserved` returns `void`. The first draft's `RevisionPreservationResult` ("preserved" / "alreadyRemoved") is not implemented, because the outcome is only known when the op is processed. |

#### Pins in metadata (still works, no option needed)

Apps that decide **when the commit is made** can tag it instead, with no new format:

```typescript
view.runTransaction(edit, { customMetadata: { session, keep: true } });
const policy: CanCompactCommit = (pair) => pair.current.custom?.keep !== true && sameSession(pair);
```

#### Still open

- Telling the app when a pin is dropped by trimming, or ignored because of the race.
- Exact rollback (remember the previous state instead of applying the opposite).
- Gating by `minVersionForCollab` instead of an explicit option, once the format is released.
- Pins together with shared branches.
- Option P2 (pins that hold trimming back).

### 12.6 Smaller items

- **Count-based retention.**
  Behaviour is documented and tested in [§4.2](#42-using-a-retention-limit-and-compaction-together).
  Still open: whether to "compact before trimming" so that N counts compacted points only.
- **Shared branches.**
  Only the `main` branch is compacted.
- **Ordering with trimming.**
  `getSummaryData` trims before writing the summary; compaction only acts on what trimming leaves.

## 13. How to run things

From `packages/dds/tree`:

```bash
# Build (compile is needed when source signatures change)
npm run build:compile
npm run build:test:esm

# Run the compaction tests only
npx mocha --spec "lib/test/shared-tree/historyCompaction.spec.js" --fgrep "History compaction"

# Run the codec tests for the pin formats
npx mocha --fgrep "message codec"
npx mocha --fgrep "EditManager Codec"

# Run the engine tests only
npx mocha --spec "lib/test/shared-tree-core/edit-manager/editManagerCorrectness.test.js" --fgrep "compactHistory"

# Print the measurements in §9 (including the memory tests)
FLUID_HISTORY_COMPACTION_REPORT=1 npx mocha --node-option expose-gc \
	--spec "lib/test/shared-tree/historyCompaction.spec.js" --fgrep "History compaction"

# After API changes
npm run build:api-reports
```

End-to-end tests, from `packages/test/test-end-to-end-tests`:

```bash
npx tsc --project ./src/test/tsconfig.json

# Local in-memory service
MOCHA_SPEC=lib/test/treeHistoryCompaction.spec.js npx mocha --driver=local --timeout=10s

# Opt-in logged walkthrough: real containers, 2–5 second waits, and a separate summarizer
FLUID_HISTORY_COMPACTION_WALKTHROUGH=1 MOCHA_SPEC=lib/test/treeHistoryCompaction.spec.js \
	npx mocha --driver=local --timeout=120s \
	--fgrep "walks through session and timestamp compaction with logs"

# Tinylicious (starts the server for you)
MOCHA_SPEC=lib/test/treeHistoryCompaction.spec.js \
	npx start-server-and-test start:tinylicious:test 7070 "npx mocha --driver=t9s --timeout=20s"
```

Notes:

- The package `.mocharc` includes all specs, so `--spec` alone still runs the whole suite. Use `--fgrep`.
- The test setup silences `console`, so measurement output is written to stdout with a `[history-compaction]` prefix.

## 14. Glossary

| Term | Meaning |
| --- | --- |
| Commit | One sequenced change to the tree, with a revision and optional custom metadata. |
| Revision | The unique ID of a commit. |
| Trunk | The sequenced history of the main branch. |
| Trunk base | The oldest commit still held; everything before it was trimmed. |
| MSN | Minimum sequence number: the oldest point that any client may still be editing from. |
| Collaboration window | Trunk commits newer than the MSN. Never changed by trimming or compaction. |
| `retainHistory` | Option that keeps commits older than the MSN instead of trimming them. |
| Trimming | Dropping old commits from the start of history. |
| Compaction | Merging neighbouring kept commits, chosen by the application. |
| Local fork | A local branch of the tree; its base commit must be kept. |
| Pin / preserved revision | A revision marked with `setRevisionPreserved`; compaction never combines it with older or newer commits. |
| `preservedTrunkIndices` | The summary field that stores pins, as positions in the summarized trunk. |
| Revertible / repair data | Undo/redo support; repair data holds removed content so it can be restored. |
| Summary | A stored snapshot of the document that new clients load from. |
| Summarizer client | The hidden client elected to write summaries. |
| Interactive client | A client serving a user, usually with a UI and local-only state. |
| Local history / local compaction | History or compaction on the particular client instance; applies to interactive and summarizer clients alike. |
| Custom metadata | App-defined JSON attached to a commit; persisted from `minVersionForCollab` 2.117. |

## 15. Metadata before and after compaction

### 15.1 Authored metadata versus retained history metadata

**Authored metadata is supplied when an edit is made.**
The app attaches `customMetadata` to a transaction, and the resulting commit carries its metadata tree.
There is no API for subsequently editing that authored metadata.
Compaction does not revise the original sequenced operations or send an operation that updates their metadata on other clients.

**Compaction rewrites the retained history representation.**
When adjacent commits A and B combine, the retained entry now represents both changes.
Its metadata depends on the compaction callback's return value.
This happens in a manual compaction pass or in the summary-time pass, not when the app originally authors A or B.

### 15.2 Before and after: one pair

Suppose the app authors two commits with the following metadata:

```typescript
// A, revision rA
const aMetadata = { name: "A", session: "session-1", timestamp: 0 };

// B, revision rB
const bMetadata = { name: "B", session: "session-1", timestamp: 2 };
```

Before compaction, each has its own `custom` and `customTree`.
If authored through nested transactions, each tree can also contain children.

| Callback result | Retained history | Metadata after the pass |
| --- | --- | --- |
| `false` | A (`rA`), B (`rB`) | Both original metadata trees remain unchanged. |
| `true` | A+B (`rB`) | `customTree` contains both original trees as ordered children. `custom` flattens them, so B's conflicting properties win. |
| An object | A+B (`rB`) | The object replaces both original trees, including their children. `custom` is that object; `customTree` has that object as its metadata and no children. |

For example, the callback can return:

```typescript
const composedMetadata = {
	name: "A+B",
	session: "session-1",
	startTimestamp: 0,
	timestamp: 2,
	isCompacted: true,
};
```

The next decision involving A+B sees this object, including A's timestamp preserved explicitly as `startTimestamp`.
It does not see either original metadata tree.
`isCompacted` is an app-defined property, not a SharedTree-managed flag.
With `true`, the original trees instead remain accessible through `customTree`, even though flattened `custom` shows B's conflicting values.

### 15.3 Does this change metadata for an existing revision?

**Yes, in the current implementation.**
The composed entry keeps B's revision (`rB`), sequence ID, and internal object identity.
`SharedBranch.composeTrunkCommits` mutates B in place: it replaces its change data and `customMetadata`, then removes A from the chain.
Calling A+B a composed entry describes its new role, but does not give it a new revision.

This distinction matters for the statement "metadata is defined when the commit is authored and remains unchanged":

- If it means **the app cannot directly edit an authored commit's metadata**, the current API follows that rule.
- If it means **metadata associated with a revision must never change, including during compaction**, the current implementation does not follow that rule for unpinned commits.
  Even the default `true` result changes B's retained metadata tree to include A.

**Open contract question:** does metadata immutability apply only to authored operations, or also to every retained representation of a revision?
The implementation currently allows the latter to change.
This must be resolved in the API discussion; describing compaction as composition alone does not resolve it.

The rewrite affects only the client performing compaction.
Other clients can retain their original history until they compact independently.
If the compacting client writes a summary, that summary contains the composed metadata, and clients loading it see that representation.

### 15.4 Preserved commits and implementation evidence

A pinned commit is excluded from compaction as both `current` and `target`.
Its change data and full metadata tree remain unchanged by compaction, and no combination crosses it.
Unpinning allows normal compaction again.
Pins still do not prevent retention-limit trimming.

Relevant implementation and tests:

- `src/shared-tree/sharedTree.ts`, `decideCompaction`: adapts `false`, `true`, or a replacement object to the engine decision.
- `src/shared-tree-core/editManager.ts`, `SharedBranch.composeTrunkCommits`: replaces the target's change data and metadata in place while keeping its revision.
- `src/shared-tree-core/editManager.ts`, `EditManager.compactHistory`: skips pairs containing either preserved revision before invoking the callback.
- `src/test/shared-tree/historyCompaction.spec.ts`: **default compaction preserves nested metadata children** and **replacement compaction discards nested metadata children** demonstrate both metadata outcomes and summary reload.
- The same file's **preserves old and newly sequenced revisions while compacting surrounding history** runs with default and replacement metadata.
  It adds commits after pinning, releases older and newer pins in stages, and verifies that unpinned commits still needed for correctness cannot compact until the MSN advances.
  See the staged walkthrough below.

### 15.5 Staged pin/unpin walkthrough with more incoming commits

The two **preserves old and newly sequenced revisions while compacting surrounding history** tests author eleven nested-metadata commits across four sessions: A/B/C, D/E/F, G/H/I, and J/K.
They add commits after pinning and release pins selectively, rather than releasing every pin at once.
One test uses default metadata (`true`); the other returns replacement metadata.
`setupPreservationWalkthrough` extracts revision tracking, pin propagation, collaboration-window checks, exact metadata expectations, and summary reloads so the tests show the timeline.

The helper records each authored commit's actual sequence number.
It checks that history-only commits are at or below the MSN, correctness-window commits are above it, and neither pinned nor correctness-window commits reach the callback in either position.
Both clients must agree after each pin or unpin operation.

| Pass | Pins and new edits | Still needed for correctness | Removed by this pass |
| --- | --- | --- | --- |
| 1 | Pin old B; pin newly sequenced E; advance A-F to history-only. | None of A-F | 0: both directions around B and E are blocked. |
| 2 | Add G/H/I after pinning, pin H, then unpin old B and new H. E stays pinned. | G/H/I, including unpinned H | 2: A/B/C combine; D/E/F and G/H/I remain separate. |
| 3 | Advance G/H/I to history-only; add J/K and pin K. E stays pinned. | J/K | 2: G/H/I combine; E and K keep their original nested metadata. |
| 4 | Unpin older E and newest K. | J/K, including unpinned K | 2: D/E/F combine; J/K remain separate. |
| 5 | Advance J/K to history-only. | None of A-K | 1: J/K finally combine. |

Summary reloads after passes 3 and 5 verify exact surviving revisions, full `custom` and `customTree`, document content, and every pin/unpin state.
The pass-3 reload includes both a history-only pin (E) and a correctness-window pin (K).
Every compaction pass checks unchanged document content and the full expected annotated history, not just removal counts.
Unannotated window-advance edits remain real boundaries between sessions; the tests do not skip them or combine across them.

**Observed result:** both metadata modes pass this scenario; no metadata-compaction failure was reproduced.
With `true`, the final flattened names are C, F, I, K, and each metadata tree retains every original nested transaction.
With replacement objects, the final names are A+B+C, D+E+F, G+H+I, J+K.
Those entries carry `startTimestamp` from the first edit and `timestamp` from the last, with `isCompacted: true` and no metadata children.
This child removal is the current replacement contract, not a failed preservation check.
Pinned commits retain their original nested trees until unpinned in both modes.
These checks do not resolve the metadata-per-revision immutability question in §15.3.

The tests run normally without real pauses.
From `packages/dds/tree`, after compiling the tests, enable their full before/after metadata and stage logs with:

```bash
FLUID_HISTORY_COMPACTION_WALKTHROUGH=1 npx mocha --fgrep "preserves old and newly sequenced revisions while compacting surrounding history"
```

### 15.6 Can `true` identify a compacted commit?

**Not reliably from the current metadata API.**
Returning `true` preserves the input metadata trees but adds no system-managed compaction marker.
`customTree` having children is not sufficient: nested transactions produce the same shape.
The engine does not need to detect a special "compacted" kind of commit to continue.
It treats the composed result as an ordinary retained commit, checks eligibility, and can offer it to the policy again.

The test **cannot distinguish default-compacted metadata from a nested transaction** compares two independently authored histories with identical A, B, and C metadata:

1. **Separate commits:** author A, B, C. Return `true` for A+B, then observe the callback for A+B with C.
2. **Nested transaction:** author one unannotated outer transaction containing annotated A and B inner transactions, followed by C. Observe that authored transaction with C.

In both cases, the callback before C sees:

```text
custom: B's metadata
customTree:
  metadata: undefined
  children:
    - A's original metadata node
    - B's original metadata node
isCompacted: no system field and no app-defined marker
```

Both callbacks return `true` again.
Both final entries keep C's revision and have exactly the same `custom` and `customTree`.
The separate-commit case removes two commits; the nested-transaction case removes one.
The other connected client does not compact.
Summary reload preserves the final metadata tree in each case without adding a marker.
The test passes with exact metadata assertions.

`requestCompaction`'s removal count tells the caller what that pass did, but it does not persist provenance for each surviving revision.
An app can return a replacement object with `isCompacted: true` or a count if it wants to keep that information.
That is an app-defined convention, not a framework-verified flag, and replacement discards the original metadata trees under the current contract.
A system-managed flag that also works with `true` would be a separate feature.

The implementation evidence is `GraphCommit` in `src/core/rebase/types.ts`, `SharedBranch.composeTrunkCommits` in `src/shared-tree-core/editManager.ts`, and `LazyTreeBranchCommitMetadata` in `src/shared-tree/history.ts`.
None records or exposes a dedicated compaction-provenance flag.
The new test uses mock interactive clients and directly summarizes the compacting tree; the real summarizer role is covered by the tests described in §10.5.

To print the comparison and full metadata snapshots:

```bash
FLUID_HISTORY_COMPACTION_WALKTHROUGH=1 npx mocha --fgrep "cannot distinguish default-compacted metadata from a nested transaction"
```
