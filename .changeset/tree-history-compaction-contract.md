---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Add an alpha API for application-guided history compaction

`ITreeAlpha` has a new `historyCompaction` property.
Use it to combine adjacent retained history commits when your application decides that the restore point between them is no longer needed.
It is exported from `@fluidframework/tree/alpha` and `fluid-framework/alpha`, along with the related types `TreeHistoryCompaction`, `CanCompactCommit`, and `SummaryHistoryCompactionOptions`.

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

Every executed manual or summary-time pass emits a `HistoryCompaction` telemetry event through the existing Fluid logger, including passes that remove no commits.
It reports the trigger, duration, status, policy calls and rejections, and completed default-metadata and replacement-metadata merges.
Failures report their source and any completed merges without logging commit metadata or raw application errors.
This event replaces the experimental `HistoryCompactionBeforeSummary` and `HistoryCompactionBeforeSummaryFailed` events.
It reports local compaction, not summary upload or acknowledgement.

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
