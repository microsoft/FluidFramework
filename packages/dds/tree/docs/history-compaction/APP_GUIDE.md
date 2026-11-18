# History compaction: app guide

**Experimental, alpha API on this branch.**
Use compaction to keep selected restore points instead of every intermediate edit.
It preserves the current document content, but removes the ability to restore the state between combined commits.
See [DEV.md](./DEV.md) for implementation details and limitations.

## 1. Configure the tree

```typescript
import {
	asAlpha,
	configuredSharedTree,
	FluidClientVersion,
	type CompactionRange,
	type PlanCompaction,
} from "@fluidframework/tree/alpha";

// Plan one range for each run of adjacent commits from the same session.
const planSameSession: PlanCompaction = (history) => {
	const ranges: CompactionRange[] = [];
	let start = 0;
	for (let index = 1; index <= history.length; index++) {
		const session = history[start]?.custom?.session;
		if (typeof session === "string" && history[index]?.custom?.session === session) {
			continue;
		}
		const oldest = history[start];
		const newest = history[index - 1];
		if (oldest !== undefined && newest !== undefined && newest !== oldest) {
			ranges.push({ oldest: oldest.revision, newest: newest.revision });
		}
		start = index;
	}
	return { ranges };
};

const SharedTree = configuredSharedTree({
	retainHistory: 1000,
	minVersionForCollab: FluidClientVersion.v2_117,
	historyCompaction: { planCompaction: planSameSession },
});
```

Register `SharedTree.getFactory()` in your container configuration, including the code used to create the summarizer client.
The summarizer is a separate client that writes the history future clients load.

| Option | Your choices |
| --- | --- |
| `retainHistory` | `true`: keep all sequenced history. A positive integer N: best effort to keep the newest N commits; more are kept when correctness needs them (collaboration window, local branches), so N is not a hard cap. `false` or `0`: keep no additional history to compact. Default: `false`. |
| `minVersionForCollab` | Use a metadata-capable format, such as `FluidClientVersion.v2_117` above, so policies can read metadata after summary reload. All collaborating clients must support the selected format. |
| `historyCompaction.planCompaction` | Your policy for summary-path compaction. Omit it to disable automatic compaction; manual requests remain available. |
| `historyCompaction.enableRevisionPreservation` | Default: `false`. Set to `true` to use preservation APIs. This writes an unreleased op and summary format: use only for prototyping with compatible clients. Not supported with shared branches or detached-root editing. |

## 2. Annotate edits and choose what to combine

For your initialized view, attach metadata when authoring edits:

```typescript
view.runTransaction(
	() => { /* Modify view.root here. */ },
	{ customMetadata: { session: sessionId } },
);
```

The policy receives the retained history of the main branch, oldest first, and returns a plan: ranges of adjacent commits to combine.
Each range names its `oldest` and `newest` commit (both inclusive) by revision.

| Plan | Result |
| --- | --- |
| A commit in no range | Kept. |
| A range without `metadata` | Combined into one commit, keeping the newest combined commit's revision. If correctness blocks the end of the range, only its eligible prefix is combined. Metadata trees of the combined commits are kept in `customTree`; flattened `custom` prefers newer values. |
| A range with `metadata` (a JSON object) | Combined into one commit, keeping `newest`'s revision. The object replaces the metadata of every commit in the range, including their children. |

The history includes commits that cannot be combined yet, so your plan can see where a run continues.
SharedTree determines correctness eligibility; the app does not need to calculate it.
If a range without replacement metadata reaches into the collaboration window or an open local branch's protected history, SharedTree combines only the eligible prefix, provided it has at least two commits.
For example, if A–C are eligible but D–E are not, a plan for A–E combines A–C into C and leaves D–E unchanged.
Ranges with replacement metadata wait until the whole range is eligible, because that metadata may describe the full range.
Any range containing a pinned commit is skipped as a whole, even if the pin is outside the eligible prefix.
A single-commit range, or a range with fewer than two eligible commits at its start, is also skipped without error.
The policy can return skipped ranges or the remaining suffix in a later pass.
Ranges must not overlap and must name revisions in the given history; otherwise the whole plan is rejected with a `UsageError` and nothing changes.

Keep the policy fast, deterministic from commit metadata, and free of side effects.
Do not edit the tree, reenter compaction, or retain the policy's commit objects.
The policy is called once per pass, on the whole retained history, including commits combined by earlier passes.
SharedTree does not add an `isCompacted` marker; provide your own replacement metadata if you need one.

## 3. Choose where compaction runs

**Persisted history:** configure `planCompaction` above so the summarizer applies it.
If the runtime reuses an existing summary handle, the tree's policy does not run.

**This client's history only:** explicitly request a pass, for example from a maintenance button or an idle task:

```typescript
const history = asAlpha(tree).historyCompaction;
const removedCount = history.requestPlannedCompaction(planSameSession);
```

This synchronous call returns the number of commits removed, not bytes saved.
It does not broadcast compaction or shrink a separate summarizer's history.
Fluid combines only retained commits that are no longer needed for collaboration or open forks.
A return value of `0` is normal; you can request another pass later.
Processing more ops, releasing a pin, or closing a fork does not automatically request a pass.

If the policy throws or returns an invalid plan, nothing is combined and the history is unchanged.
On the summary path the error is logged and the summary is still written.
On a manual request the error is rethrown to the caller; the tree remains usable.

## 4. Preserve selected restore points

First enable `historyCompaction.enableRevisionPreservation` in the factory.
Use a revision from the main view's `branchHistory`:

```typescript
const revision = asAlpha(view).branchHistory.getHead()?.revision;
if (revision !== undefined) {
	history.setRevisionPreserved(revision, true);
	const preserved = history.isRevisionPreserved(revision);
	history.setRevisionPreserved(revision, false);
}
```

Preserved commits are never combined: SharedTree skips any planned range that contains one.
To combine the commits on either side, plan ranges that end before and start after the pinned commit (check `isRevisionPreserved`).
Pins are shared with other clients, including the summarizer, and stored in summaries.
They do **not** prevent the retention limit from trimming the commit.
Unpinning allows later compaction; it does not schedule it.

**A pin is optimistic.**
If the summarizer already compacted or trimmed the revision, it rejects the pin:
every client unpins it, and each client that had it marked raises `revisionPreservationRejected`.
Without this, `isRevisionPreserved` would report `true` for a checkpoint that is gone after a reload.

```typescript
const unsubscribe = history.events.on("revisionPreservationRejected", (revision) => {
	// The checkpoint is not in stored history. Show it as unavailable; do not retry automatically.
	markCheckpointUnavailable(revision);
});
```

Pin soon after the commit is made to avoid rejections, or tag the commit with metadata when it is made and end a range at it in your policy.
The rejection needs a connected summarizer, so it can arrive long after the pin.

## 5. Monitor telemetry

Use your existing Fluid container logger's `send(event)` hook.
Match `event.eventName.endsWith("HistoryCompaction")`, because Fluid prefixes event names.
Configure a logger for the summarizer too; observing only your interactive client does not show its passes.

One event describes one executed pass, including successful no-ops and failures.
Successful passes use the generic telemetry category; failed passes use the error category.

| Field | What you can monitor |
| --- | --- |
| `trigger` | `"manual"` or `"summary"` execution path, not client role. A manual call on a summarizer reports `"manual"`. |
| `status` | `"success"` or `"failure"`. |
| `failureSource` | `"policy"` for a thrown policy error; `"plan"` for an invalid plan; `"engine"` for an internal failure. Unset on success. |
| `durationMs` | Pass latency, including policy execution; excludes summary encoding and upload. |
| `removedCount` | Commits removed by combining. |
| `policyCallCount`, `policyDurationMs` | The policy is called once per pass; how long it took (including plan validation). |
| `historyCommitCount`, `eligibleCommitCount` | How much history your policy saw, and how much of it could be combined. Low eligibility means the collaboration window, open branches, or a recent load limited the pass. |
| `plannedRangeCount`, `combinedRangeCount`, `skippedRangeCount` | Ranges in your plan, how many were combined in full or as an eligible prefix, and how many were skipped (single commit, not yet eligible, or containing a pin). |
| `defaultMergeCount`, `replacementMergeCount` | Combined ranges using the default merge versus replacement metadata. Their sum equals `combinedRangeCount`. |
| `replacementMetadataLength` | Total JSON length of replacement metadata in your plan; a size proxy, not stored bytes. |
| `composeCallCount`, `composedChangeCount`, `composeDurationMs` | Cost of combining: one compose call per combined range, over all of its commits. |
| `peerBranchCount`, `peerRebaseDurationMs` | Remote client branches the tree rebased before composing. Diagnostic only. |

Track pass latency, removal counts, and failure rates separately by `trigger`.
A successful zero-removal pass with `eligibleCommitCount: 0` had nothing to combine; with eligible commits, compare `plannedRangeCount` and `skippedRangeCount` to see whether your plan asked for nothing or its ranges could not be combined yet.
Telemetry does not identify why each range was skipped (the opt-in diagnostic trace in [DEV.md](./DEV.md) does) or measure byte or heap savings.
The diagnostic trace also reports `CompactionRangeClipped`, with requested and eligible-prefix lengths; `CompactionRangeMerged` confirms the actual merge.
The compaction payload excludes raw commit metadata, document content, and application exception text.

Two events report pins that could not be kept (match by suffix; they contain no revisions):

| Event | Meaning |
| --- | --- |
| `PreserveRevisionIgnored` | A client processed a pin for a revision it no longer has. `isSummarizer` and `rejectionSent` are `true` when the summarizer rejected it; only those matter for stored history. |
| `PreserveRevisionRejected` | A client processed the summarizer's rejection. `wasPreserved: true` means the app event was raised on that client. |

**Do not count pass events as persisted summaries.**
A summary can run compaction during garbage collection (GC) handle scanning and again during encoding, producing a merge event followed by a no-op event.
Observe the runtime's summary acknowledgement separately to confirm persistence.
