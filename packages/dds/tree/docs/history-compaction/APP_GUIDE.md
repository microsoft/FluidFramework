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
	type CanCompactCommit,
} from "@fluidframework/tree/alpha";

const sameSession: CanCompactCommit = ({ current, target }) =>
	typeof current.custom?.session === "string" &&
	current.custom.session === target.custom?.session;

const SharedTree = configuredSharedTree({
	retainHistory: 1000,
	minVersionForCollab: FluidClientVersion.v2_117,
	historyCompaction: { canCompactCommit: sameSession },
});
```

Register `SharedTree.getFactory()` in your container configuration, including the code used to create the summarizer client.
The summarizer is a separate client that writes the history future clients load.

| Option | Your choices |
| --- | --- |
| `retainHistory` | `true`: keep all sequenced history. A positive integer: limit retained commits, plus history still needed for collaboration. `false` or `0`: keep no additional history to compact. Default: `false`. |
| `minVersionForCollab` | Use a metadata-capable format, such as `FluidClientVersion.v2_117` above, so policies can read metadata after summary reload. All collaborating clients must support the selected format. |
| `historyCompaction.canCompactCommit` | Your policy for summary-path compaction. Omit it to disable automatic compaction; manual requests remain available. |
| `historyCompaction.enableRevisionPreservation` | Default: `false`. Set to `true` to use preservation APIs. This writes an unreleased op and summary format: use only for prototyping with compatible clients. Not supported with shared branches or detached-root editing. |

## 2. Annotate edits and choose what to combine

For your initialized view, attach metadata when authoring edits:

```typescript
view.runTransaction(
	() => { /* Modify view.root here. */ },
	{ customMetadata: { session: sessionId } },
);
```

The policy receives adjacent commits: `current` is older; `target` is newer.

| Return value | Result |
| --- | --- |
| `false` | Keep both commits. |
| `true` | Combine them, keeping `target.revision`. Preserve both metadata trees in `customTree`; flattened `custom` prefers newer values. |
| A JSON-compatible object | Combine them, keeping `target.revision`. The object replaces both entire metadata trees, including their children. |

Keep the policy fast, deterministic from commit metadata, and free of side effects.
Do not edit the tree, reenter compaction, or retain the callback's commit objects.
SharedTree does not add an `isCompacted` marker; return your own replacement metadata if you need one.

## 3. Choose where compaction runs

**Persisted history:** configure `canCompactCommit` above so the summarizer applies it.
If the runtime reuses an existing summary handle, the tree's policy does not run.

**This client's history only:** explicitly request a pass, for example from a maintenance button or an idle task:

```typescript
const history = asAlpha(tree).historyCompaction;
const removedCount = history.requestCompaction(sameSession);
```

This synchronous call returns the number of commits removed, not bytes saved.
It does not broadcast compaction or shrink a separate summarizer's history.
Fluid offers only retained commits that are no longer needed for collaboration or open forks.
A return value of `0` is normal; you can request another pass later.
Processing more ops, releasing a pin, or closing a fork does not automatically request a pass.

A summary-policy error stops that pass's policy calls but still allows the summary to be written.
A manual policy error propagates and breaks the tree.
In both cases, completed merges remain applied.

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

Preserved commits never combine with older or newer commits, and compaction cannot cross them.
Pins are shared with other clients, including the summarizer, and stored in summaries.
They do **not** prevent the retention limit from trimming the commit.
Unpinning allows later compaction; it does not schedule it.

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
| `failureSource` | `"policy"` for a thrown policy error or invalid return; `"engine"` for an internal failure. Unset on success. |
| `durationMs` | Pass latency, including policy execution; excludes summary encoding and upload. |
| `removedCount` | Completed merges, including progress before a later failure. |
| `policyCallCount`, `rejectedPairCount` | App policy calls and explicit `false` answers. Protected or ineligible pairs are not counted as rejections. |
| `defaultMergeCount`, `replacementMergeCount` | Completed merges using `true` versus replacement metadata. Their sum equals `removedCount`. |

Track pass latency, removal counts, and failure rates separately by `trigger`.
A successful zero-removal pass with `policyCallCount: 0` offered no pairs; calls with only rejections mean your policy kept every offered pair.
Telemetry does not identify individual eligibility blockers or measure byte or heap savings.
The compaction payload excludes raw commit metadata, document content, and application exception text.

**Do not count pass events as persisted summaries.**
A summary can run compaction during garbage collection (GC) handle scanning and again during encoding, producing a merge event followed by a no-op event.
Observe the runtime's summary acknowledgement separately to confirm persistence.
