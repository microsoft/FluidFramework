# Summary Generation and Acceptance

This document describes generic ContainerRuntime and garbage-collection (GC) summary behavior.
The contracts do not depend on an application format, manifest, schema, or method of constructing the loaded state.
Application-owned projection callbacks participate in the same acceptance lifecycle without changing GC's responsibility.

## Full output, tracking, and accepted parents

A summary handle references a path in a particular stored parent.
It is valid only when the content being reused matches the state captured for that parent.
Loaded state whose native paths do not exist in storage needs complete structural output before those paths can be reused.

`ISummaryGenerationOptions` separates two policies from summary scheduling:

- `forceFullTree` requests full structural output for the runtime's lifetime.
- `fullTreeUntilFirstAck` requests full structural output
  until this runtime's tracked full proposal is acknowledged and successfully adopted.

An explicit full-tree request also remains effective.
`ContainerRuntime.getEffectiveFullTree()` combines these inputs
and propagates the result to native descendants, GC serialization, and any application projection callback.
Unconditional forcing is not cleared by acceptance.

`fullTree` controls the representation written to storage, not whether the attempt is tracked.
Full tracked attempts still capture the baseline needed by subsequent incremental summaries.
Generation, upload, submission, failure, or an untracked acknowledgment cannot establish that accepted baseline.

`fullTree` is also distinct from `fullGC`.
The former disables summary-handle reuse; the latter requests regeneration of the reachability graph during GC execution.
Writing complete stored GC data does not itself change sweep policy,
rerun reachability discovery, or inline attachment payloads.

## Proposal-correlated GC state

`GCSummaryStateTracker.summarize()` receives both `trackState` and `fullTree`.
A tracked full attempt captures GC state, tombstones, and deleted nodes even though it writes blobs rather than handles.
Without capture, accepting a full summary would not give GC a baseline for the next incremental summary.
Untracked generation emits complete GC data without replacing a submitted proposal's pending state.

A single "most recently generated" pending value is insufficient.
Consider proposal A containing GC state G1, followed by attempt B containing G2.
If A's acknowledgment adopted G2,
a later comparison could conclude that G2 is unchanged and emit a handle to A's stored G1.
The comparison baseline and storage parent would disagree.

The tracker therefore keeps three states:

| State               | Transition                                                                                            | Invariant                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Current generation  | `wipSummaryData` captures the tracked attempt.                                                        | Abandoned or failed generation does not replace submitted state.    |
| Submitted proposals | `completeSummary(proposalHandle, referenceSequenceNumber)` captures a proposal in `pendingSummaries`. | Acknowledgment identifies exactly which generated state to adopt.   |
| Accepted baseline   | `refreshLatestSummary(result, proposalHandle)` adopts the matching tracked proposal.                  | Incremental comparisons and `/gc` handles describe the same parent. |

ContainerRuntime invokes completion and cleanup alongside native summarizer-node hooks.
Cleanup removes only work in progress; submitted proposals remain eligible for delayed acknowledgments.
Proposal handles distinguish attempts at the same reference sequence number.
Retirement removes older-checkpoint proposals consistently with native tracking,
not another proposal merely because its checkpoint is equal.

## Coordinated acceptance

`ContainerRuntime.refreshLatestSummaryAck()` serializes acceptance work.
A new generation is blocked while acceptance is in progress.
For a locally tracked proposal it:

1. Refreshes native summarizer nodes.
2. Verifies the captured generation matches the proposal and checkpoint.
3. Refreshes that proposal's GC state.
4. Records the accepted parent: proposal handle, acknowledgment handle, and reference sequence number.
5. Invokes that proposal's optional synchronous application acceptance callback.
6. Ends temporary full-tree forcing if the accepted generation was full.

A remote or untracked acknowledgment does not manufacture a local baseline.
The existing fetch-latest/close handling remains applicable to a newer remote summary.
Duplicate acknowledgments cannot promote an already-adopted application callback again.

If native, GC, or application adoption fails, the runtime closes rather than continuing with inconsistent reuse state.
This is fail-closed coordination, not transactional rollback of already-adopted native state.

## Recovery generations

GC auto-recovery requests a full reachability run and waits for a summary covering that recovery to be accepted.
An older proposal's delayed acknowledgment must not clear a newer request.
Each recovery request increments a local generation; a completed run exposes that generation to summary capture.
Only adoption of a proposal carrying the current completed generation clears the request.

`IGCSummaryTrackingData.recoveryGeneration` is in-memory bookkeeping, not a new stored GC field.
The GC blob layout and handle paths remain unchanged.
The mechanism coordinates persistence and recovery; it does not introduce a new reachability model.

## Application projection participation

`additionalRootTree` registers an application-selected root key and a synchronous callback.
The callback receives `ISummaryGenerationContext`,
including the checkpoint, effective full-tree/tracking policy, and exact accepted parent.
It returns `IApplicationProjectionSummary`:
an opaque application-owned tree and an optional proposal-specific `onAccepted` callback.
The runtime requires no manifest, content-format identity, or predetermined root key.

Capture cannot mutate shared state or perform asynchronous work.
The factory must realize required state before summary generation, including on summarizer clients.
Acceptance promotes state captured for that proposal, not current mutable state.
The callback still runs when native descendants reuse handles;
full output or a missing valid parent prohibits application handles.

See the [application projection design][application-design] for one consumer of this contract.
GC tracking remains independent of that application.

[application-design]: ../../../docs/content/Architecture/Application-Projections/Fluid-Design.md

## Source and regression map

| Source                                                        | Responsibility                                                                       | Focused coverage                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`containerRuntime.ts`](src/containerRuntime.ts)              | Generation policy, root participation, proposal capture, and coordinated acceptance. | [`containerRuntime.summaryGeneration.spec.ts`](src/test/containerRuntime.summaryGeneration.spec.ts): retries, delayed adoption, remote/duplicate acknowledgments, explicit full requests, callbacks, and handle preconditions. |
| [`gcSummaryStateTracker.ts`](src/gc/gcSummaryStateTracker.ts) | Full tracked capture, submitted proposals, and accepted GC state.                    | [`gcSummaryStateTracker.spec.ts`](src/test/gc/gcSummaryStateTracker.spec.ts): adopt A after B and abandoned/untracked work, then independently adopt B.                                                                        |
| [`garbageCollection.ts`](src/gc/garbageCollection.ts)         | Forward policy/proposal identity and correlate recovery.                             | [`garbageCollection.spec.ts`](src/test/gc/garbageCollection.spec.ts): early/older recovery acknowledgments retain the request; the matching accepted generation clears it.                                                     |
| [`gcDefinitions.ts`](src/gc/gcDefinitions.ts)                 | Runtime/GC completion, cleanup, and proposal-aware refresh contract.                 | The runtime and GC suites exercise the shared lifecycle without depending on a content format.                                                                                                                                 |
