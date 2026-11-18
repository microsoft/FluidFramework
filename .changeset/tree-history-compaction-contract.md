---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Add an alpha API for application-guided history compaction

`ITreeAlpha` has a new `historyCompaction` property.
Use it to combine runs of adjacent retained history commits when your application decides that the restore points between them are no longer needed.
It is exported from `@fluidframework/tree/alpha` and `fluid-framework/alpha`, along with the related types `TreeHistoryCompaction`, `TreeHistoryCompactionEvents`, `PlanCompaction`, `CompactionPlan`, `CompactionRange`, and `SummaryHistoryCompactionOptions`.

`requestPlannedCompaction(planCompaction)` calls your `PlanCompaction` callback once with the retained history, oldest first, as the same `TreeBranchCommitMetadata` objects the history APIs return (`revertTo` is always `undefined` inside the callback).
The callback returns a plan: ranges of adjacent commits, each naming its `oldest` and `newest` commit by revision.
Each combined range keeps the newest combined commit's revision.
By default the combined commit keeps all of the range's metadata; give the range a `metadata` object to use that object as the combined commit's metadata instead.
The call returns how many commits were removed.

Only history kept by the `retainHistory` option can be compacted.
For ranges without replacement metadata, SharedTree combines the eligible prefix and leaves commits still needed for collaboration or local branches unchanged.
A prefix must contain at least two commits to be combined.
Ranges with replacement metadata wait until the whole range is eligible, because their metadata may describe the full range.
Ranges containing a preserved revision are always skipped as a whole, not shortened.
If the callback throws or returns an invalid plan, the history is unchanged.

```typescript
const removedCount = asAlpha(tree).historyCompaction.requestPlannedCompaction((history) => ({
	ranges: [{ oldest: history[0].revision, newest: history[2].revision }],
}));
```

To compact the history that gets stored, set the new `historyCompaction` option in `SharedTreeOptions` (from `@fluidframework/tree/alpha`).
Its `planCompaction` policy runs on the client that writes the summary (normally the summarizer client), right before each summary of the tree is written.
If the policy throws, nothing is compacted and a failure is logged, but the summary is still written.

Every executed manual or summary-time pass emits a `HistoryCompaction` telemetry event through the existing Fluid logger, including passes that remove no commits.
It reports the trigger, duration, status, how many ranges were planned, combined, and skipped, completed default-metadata and replacement-metadata merges, and the cost of composing them.
Failures report their source without logging commit metadata or raw application errors.
This event replaces the experimental `HistoryCompactionBeforeSummary` and `HistoryCompactionBeforeSummaryFailed` events.
It reports local compaction, not summary upload or acknowledgement.

```typescript
const factory = configuredSharedTree({
	retainHistory: true,
	historyCompaction: { planCompaction: planSameGroup },
}).getFactory();
```

To keep a specific point in time, call `setRevisionPreserved(revision, true)`.
Compaction skips any planned range that contains a preserved commit, so its change data and metadata stay unchanged.
Commits on either side can still be compacted by ranges that end before or start after it.
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
	historyCompaction: { planCompaction: planSameGroup, enableRevisionPreservation: true },
}).getFactory();

asAlpha(tree).historyCompaction.setRevisionPreserved(publishedRevision, true);
```
