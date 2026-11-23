---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Add an alpha API for application-guided history compaction

`ITreeAlpha` has a new `historyCompaction` property.
Use it to combine adjacent retained history commits when your application decides that the restore point between them is no longer needed.
It is exported from `@fluidframework/tree/alpha` and `fluid-framework/alpha`, along with the related types `TreeHistoryCompaction`, `TreeHistoryCompactionEvents`, `CanCompactCommit`, and `SummaryHistoryCompactionOptions`.

`requestCompaction(canCompactCommit)` calls your callback for each pair of adjacent commits that can be combined, oldest first.
The callback receives two neighboring commits, `current` (the older one) and `target` (the next one), as the same `TreeBranchCommitMetadata` objects the history APIs return (`revertTo` is always `undefined` inside the callback).
Return `true` to combine `current` into `target`.
Return an object instead to combine them and use that object as the combined commit's metadata.
The combined commit keeps `target`'s revision.
The call returns how many commits were removed.

Only history kept by the `retainHistory` option can be compacted.
Commits that are still needed for collaboration, or that local branches depend on, are never combined.

```typescript
const removedCount = asAlpha(tree).historyCompaction.requestCompaction(
	({ current, target }) =>
		current.custom?.groupId !== undefined && current.custom.groupId === target.custom?.groupId,
);
```

To compact the history that gets stored, set the new `historyCompaction` option in `SharedTreeOptions` (from `@fluidframework/tree/alpha`).
Its `canCompactCommit` policy runs on the client that writes the summary (normally the summarizer client), right before each summary of the tree is written.
If the policy throws, compaction stops and a failure is logged, but the summary is still written.
If SharedTree itself fails to combine a pair, that pair is left uncombined and skipped for the rest of the session, the failure is logged, and compaction and the summary continue.
If SharedTree fails while preparing other clients' branches for compaction, the failure is logged and the pass ends early, but the summary is still written.
`requestCompaction` does not throw for either kind of failure.

Every executed manual or summary-time pass emits a `HistoryCompaction` telemetry event through the existing Fluid logger, including passes that remove no commits.
It reports the trigger, duration, status, policy calls and rejections, and completed default-metadata and replacement-metadata merges.
Failures report their source and any completed merges without logging commit metadata or raw application errors.
This event replaces the experimental `HistoryCompactionBeforeSummary` and `HistoryCompactionBeforeSummaryFailed` events.
It reports local compaction, not summary upload or acknowledgement.
Normal pass events also explain whether local forks, collaboration, or tied bounds limit eligibility, with sequenced and unsequenced counts, before/after history counts, and zero-removal reasons.
Content-free fork lifecycle events share identifiers with the optional history trace; branch ownership remains unknown rather than being inferred.
Compaction preserves original atom and detached-node identities so retained history can still be read and restored, including after summary reload.
It transfers repair-data cleanup ownership to the surviving revision and invalidates cached inverses when a commit absorbs older changes.
Previously captured `revertTo` callbacks reject safely if compaction changed their history path; reacquire the callback before restoring.
Revision replacement also tracks the maximum allocated local ID when callers remap IDs, preventing summary decoder IDs from colliding with remapped IDs.

```typescript
const factory = configuredSharedTree({
	retainHistory: true,
	historyCompaction: {
		canCompactCommit: ({ current, target }) =>
			current.custom?.groupId !== undefined && current.custom.groupId === target.custom?.groupId,
	},
}).getFactory();
```

To keep a specific point in time, call `setRevisionPreserved(revision, true)`.
Compaction never combines a preserved commit with older or newer commits, so its change data and metadata stay unchanged.
Commits on either side can still be compacted, but not across the preserved commit.
Pins are sent to all clients, honoured by the summarizer's policy, and stored in the summary.
Call `setRevisionPreserved(revision, false)` to release the pin, and `isRevisionPreserved(revision)` to check it.
A pin is dropped when the `retainHistory` limit removes its commit.

A pin is applied locally right away, but the summarizer may already have compacted or trimmed the revision.
In that case the summarizer rejects the pin: every client unpins it, and each client that had it marked raises the new `revisionPreservationRejected` event on `historyCompaction.events` (see `TreeHistoryCompactionEvents`).

```typescript
asAlpha(tree).historyCompaction.events.on("revisionPreservationRejected", (revision) => {
	// This restore point is not in the stored history.
});
```

Pins use a new, unreleased op and summary format, so they must be turned on with `historyCompaction.enableRevisionPreservation: true`.
Only turn this on when every client that collaborates on the document runs a version that supports it.
Pins are not supported when shared branches or detached-root editing is enabled.

```typescript
const factory = configuredSharedTree({
	retainHistory: 1000,
	historyCompaction: { canCompactCommit: sameGroup, enableRevisionPreservation: true },
}).getFactory();

asAlpha(tree).historyCompaction.setRevisionPreserved(publishedRevision, true);
```
