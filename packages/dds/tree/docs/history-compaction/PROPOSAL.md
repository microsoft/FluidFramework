# Proposal: Application-guided history compaction

## Goal and feedback requested

**Goal:** agree on an API for compacting retained history while preserving application-selected checkpoints.

**Feedback needed:** choose a policy alternative and flag gaps in metadata handling, compaction timing, revision preservation, or error behavior.
Include a concrete application scenario for any required changes.
This is an API design review, not production-readiness approval.

## Common approach

SharedTree selects adjacent commits in retained history and asks an application policy, `canCompactCommit({ current, target })`, whether to combine them.
The policy uses application-defined metadata, such as session IDs, timestamps, or checkpoint markers.

Compaction proceeds oldest first.
When a pair is combined, the newer commit keeps its revision and absorbs the older commit's changes.
The intermediate state is no longer available, but the current document state is unchanged.
Commits still needed for collaboration or local branches, and explicitly preserved revisions, are excluded.

## API shape

The common shape uses one policy type for manual and summary-time compaction.
For alternatives 1-3, `CompactionDecision` is a placeholder for the return type defined by the selected alternative below, not a union of all alternatives.
Alternative 4 instead supplies a policy object containing two callbacks; its entry-point differences are shown in that subsection.
This excerpt shows the compaction and revision-preservation API; unrelated options are omitted.

```typescript
type CanCompactCommit = (candidate: {
	readonly current: TreeBranchCommitMetadata;
	readonly target: TreeBranchCommitMetadata;
}) => CompactionDecision;

interface ITreeAlpha {
	readonly historyCompaction: TreeHistoryCompaction;
}

interface TreeHistoryCompaction {
	requestCompaction(canCompactCommit: CanCompactCommit): number;
	setRevisionPreserved(revision: CommitRevision, preserved: boolean): void;
	isRevisionPreserved(revision: CommitRevision): boolean;
	readonly events: Listenable<TreeHistoryCompactionEvents>;
}

interface TreeHistoryCompactionEvents {
	revisionPreservationRejected(revision: CommitRevision): void;
}

interface SharedTreeOptions {
	readonly historyCompaction?: SummaryHistoryCompactionOptions;
}

interface SummaryHistoryCompactionOptions {
	readonly canCompactCommit?: CanCompactCommit;
	readonly enableRevisionPreservation?: boolean;
}
```

`current` is the older commit; `target` is the newer commit and keeps its revision when combined.
Both expose application metadata through `custom` and its tree representation through `customTree`.
`requestCompaction` returns the number of commits removed.
Omitting the summary-time policy disables automatic compaction.

### Preserving revisions

Revision preservation is independent of the policy alternative.
It lets an application protect an existing main-branch revision, for example a user-selected checkpoint, without changing its compaction policy.
Enable it with `historyCompaction.enableRevisionPreservation: true` when configuring SharedTree; it defaults to `false`.

```typescript
const history = asAlpha(sharedTree).historyCompaction;

history.events.on("revisionPreservationRejected", (revision) => {
	console.warn("Checkpoint could not be preserved:", revision);
});

history.setRevisionPreserved(checkpointRevision, true);
const isPreserved = history.isRevisionPreserved(checkpointRevision);

// When the checkpoint is no longer needed:
history.setRevisionPreserved(checkpointRevision, false);
```

`checkpointRevision` is a `CommitRevision` obtained from the tree's main-branch history.
A preserved commit is never offered as either `current` or `target`.
Compaction leaves its change data and metadata unchanged and cannot combine commits across it.
Preservation does not override the history retention limit: trimming can still remove the revision.

Unlike manual compaction, preservation changes are sent to other clients, including the summarizer, as operations and are stored in summaries.
Preservation is optimistic: `isRevisionPreserved` returns `true` immediately, not confirmation from the summarizer.
If the summarizer has already removed the revision, it rejects the request; clients clear the preserved flag and notify applications through `revisionPreservationRejected`.
Trying to preserve a revision missing from the local main-branch history throws a `UsageError`.

The current prototype requires an unreleased operation and summary format that all participating clients must support.
Revision preservation is not supported with experimental shared branches or detached-root editing.

## API and metadata alternatives

All alternatives use the same candidate shape:

```typescript
interface CompactionCandidate {
	readonly current: TreeBranchCommitMetadata;
	readonly target: TreeBranchCommitMetadata;
}
```

Each example combines commits from the same editing session.
For example, consider `current.custom = { session: "s1", author: "ana" }` and `target.custom = { session: "s1", author: "ben" }`.
The alternatives differ in whether they retain both authors' original metadata or replace it with a session-only object.
Only the boolean and boolean-or-JSON forms are supported by the current prototype; the other shapes are alternatives for evaluation.
Alternatives 1-3 change only the callback's return type.
Alternative 4 changes how the policy is supplied, not the revision-preservation API.

### 1. Boolean only

```typescript
type CompactionDecision = boolean;

const canCompactCommit: CanCompactCommit = ({ current, target }) =>
	typeof current.custom?.session === "string" &&
	current.custom.session === target.custom?.session;
```

`false` keeps both commits.
`true` combines them and retains their original metadata trees as children.
Flattened metadata uses the newer value for conflicting keys.
In this example, the combined commit's `custom` is `{ session: "s1", author: "ben" }`, while `customTree` retains both originals.

**Trade-off:** this is the simplest API and preserves per-edit metadata, but that metadata keeps growing.
Policies that need an aggregate value, such as a run's start time, must derive it from `customTree` rather than rely on newest-wins metadata.

### 2. Boolean or JSON object

```typescript
type CompactionDecision = boolean | JsonCompatibleReadOnlyObject;

const canCompactCommit: CanCompactCommit = ({ current, target }) => {
	if (
		typeof current.custom?.session !== "string" ||
		current.custom.session !== target.custom?.session
	) {
		return false;
	}
	return { session: current.custom.session };
};
```

`false` keeps both commits, and `true` uses the default metadata merge from alternative 1.
Returning a JSON object approves compaction and replaces both commits' metadata with that object.
In this example, `custom` becomes `{ session: "s1" }`, and `customTree` contains that object with no children.
The original author metadata is discarded.
The next policy call sees the replacement metadata.

**Trade-off:** one callback supports both simple decisions and compact aggregate metadata, such as `{ start, end, count }`.
However, an object implicitly means approval, and the application must retain any information needed for later decisions or history display.

### 3. Explicit decision object

```typescript
type CompactionDecision =
	| { readonly compact: false }
	| {
			readonly compact: true;
			readonly metadata?: JsonCompatibleReadOnlyObject;
	  };

const canCompactCommit: CanCompactCommit = ({ current, target }) => {
	if (
		typeof current.custom?.session !== "string" ||
		current.custom.session !== target.custom?.session
	) {
		return { compact: false };
	}
	return {
		compact: true,
		metadata: { session: current.custom.session },
	};
};
```

`{ compact: false }` keeps both commits.
`{ compact: true }` uses the default metadata merge.
Providing `metadata` replaces both commits' metadata, producing the same session-only result as alternative 2.

**Trade-off:** approval and replacement metadata are explicit, and the result can accommodate future options.
However, every policy must return a wrapper object, even for a simple yes-or-no decision.
The wrapper's `metadata` field must also remain distinct from similarly named application metadata.

### 4. Separate decision and metadata callbacks

This is a structural alternative to the single-callback API, rather than another return type.
`canCompactCommit` always returns a boolean, while the optional `composeMetadata` callback supplies replacement metadata.
For this alternative, the policy-related parts of the top-level API would become:

```typescript
type CanCompactCommit = (candidate: CompactionCandidate) => boolean;

interface CompactionPolicy {
	readonly canCompactCommit: CanCompactCommit;
	readonly composeMetadata?: (
		candidate: CompactionCandidate,
	) => JsonCompatibleReadOnlyObject;
}

interface TreeHistoryCompaction {
	requestCompaction(policy: CompactionPolicy): number;
	// Revision-preservation members remain unchanged.
}

interface SummaryHistoryCompactionOptions {
	readonly policy?: CompactionPolicy;
	readonly enableRevisionPreservation?: boolean;
}
```

Both entry points accept the same policy object:

```typescript
const policy: CompactionPolicy = {
	canCompactCommit: ({ current, target }) =>
		typeof current.custom?.session === "string" &&
		current.custom.session === target.custom?.session,
	composeMetadata: ({ current }) => {
		const session = current.custom?.session;
		return typeof session === "string" ? { session } : {};
	},
};
```

SharedTree calls `composeMetadata` only after `canCompactCommit` returns `true`, and before modifying either commit.
Its result replaces both commits' metadata, producing the same session-only result as alternatives 2 and 3.
Omitting `composeMetadata` uses the default metadata merge.
This alternative would require both manual and summary-time entry points to accept a policy object instead of a single callback.
Manual compaction uses `tree.historyCompaction.requestCompaction(policy)`; summary-time configuration uses `historyCompaction: { policy }`.

**Trade-off:** eligibility and metadata composition are separate responsibilities.
However, the callbacks must agree on their assumptions, may repeat metadata processing, and require a larger configuration surface.

### Recommendation

**Recommendation:** use **boolean or JSON object**, as implemented in the current prototype.
It keeps simple policies short while allowing applications to retain a run's start time, edit count, or authors without keeping all original metadata.
Replacement metadata must be JSON-compatible and contain everything later policy calls need.
Policies must be deterministic and free of side effects.

## When compaction happens

**Before summarization:** configure the policy through `SharedTreeOptions.historyCompaction`.
It runs on the client writing the summary, normally the summarizer, so the compacted history is persisted.

**On explicit request:** call `tree.historyCompaction.requestCompaction(policy)`.
It returns the number of commits removed and changes only that client's history; it sends no operation to other clients.

## Telemetry

### Compaction pass

The current prototype emits one `HistoryCompaction` event per executed pass, including passes that remove no commits.
The event records `trigger` (`"manual"` or `"summary"`), `status`, `durationMs`, and, on failure, `failureSource` (`"policy"` or `"engine"`).
Duration covers the compaction pass, not summary encoding or upload.

Counters describe what the pass considered and changed:
`eligibleCommitCount`, `eligiblePairCount`, `policyCallCount`, `rejectedPairCount`, `preservedPairCount`, and `removedCount`.
`defaultMergeCount` and `replacementMergeCount` distinguish default metadata merges from replacements.
`peerBranchCount` records remote branches rebased before composition.
On failure, completed merges remain included in the counters.

The event also includes `replacementMetadataLength`, the total JSON string length of returned replacement metadata.
This is a size proxy, not the encoded revision size or persisted storage size.

### Revision preservation

`PreserveRevisionIgnored` records a preservation request for a revision that the receiving client no longer has.
It includes `isSummarizer`, `rejectionSent`, and `local`.
`PreserveRevisionRejected` records a rejection operation and includes `wasPreserved` and `local`.
Applications use the separate `revisionPreservationRejected` event to update checkpoint state.

### Proposed size measurements

An optional extension could record encoded change and metadata sizes before and after each composition.
The before measurement would cover both input commits; the after measurement would cover the combined commit.
Pass-level totals could report `encodedBytesBefore`, `encodedBytesAfter`, and `savedBytes`.
These fields are not implemented, and savings can be negative.

Per-composition sizes do not capture all shared encoding overhead, repair data, or heap usage.
For persisted storage impact, measure the encoded history summary before and after the pass instead.
Additional encoding has a cost, so measurement frequency and whether to expose results to applications remain API decisions.

### Logging and privacy

Telemetry uses the existing Fluid logger, including the logger configured for the summarizer.
Events do not include revision identifiers, custom metadata values, document content, or application policy error messages and stacks.
Internal engine errors are attached to failure events.

A summary-triggered event does not prove that the summary was uploaded or acknowledged.
One summary can run compaction more than once, including during garbage collection, so event counts are not summary counts.
Reusing an existing summary handle does not execute a new compaction pass.

## Errors and failure behavior

### Policy failures during summarization

If the policy throws or returns an invalid value, the current prototype stops calling it for the rest of the pass.
Already completed merges remain; remaining pairs are not combined.
It logs a policy failure and continues summarization without marking the tree broken.
Compaction is not atomic.

### Policy failures during manual compaction

The current prototype propagates the error from `requestCompaction`.
Already completed merges remain, the caller receives no removed count, and telemetry records partial progress.
The error passes through the tree's breaker and marks the tree broken.

**Open API decision:** should manual policy failures stop the pass without breaking the tree, and should callers receive a structured result containing partial progress?
This would change the current `number` return contract or require a separate error/result mechanism.

### Invalid metadata and preservation requests

Policies must return JSON-compatible replacement metadata and must not mutate it after returning.
The prototype validates the top-level return shape, not every nested value.
Serialization can fail during the pass or later during summary encoding; the summary-time policy error handling does not cover every later encoding failure.

Calling `setRevisionPreserved` without enabling preservation, or trying to preserve a revision missing from local main-branch history, throws a `UsageError` without breaking the tree.
A request accepted locally but rejected by the summarizer is asynchronous: it clears the preserved flag and raises `revisionPreservationRejected`, rather than throwing from the original call.

### Engine failures

Internal compaction failures propagate and are logged with `failureSource: "engine"`.
They are not treated as a policy declining a pair, and the API does not promise rollback of completed merges.

For detailed implementation behavior and known correctness limitations, see [the developer guide](./DEV.md).
