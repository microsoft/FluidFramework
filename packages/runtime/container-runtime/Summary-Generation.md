# Summary Generation and Acceptance

This document describes existing summary mechanisms and the changes added to support application projections.
ContainerRuntime combines distributed data structure (DDS) subtrees, runtime metadata,
and garbage-collection (GC) state into a summary.
An application can also provide summary callbacks that add its own content, such as HTML, as another summary subtree.
That content is an **application projection**; see [its callback contract](#application-projection-participation).

## Existing mechanisms and changes

| Area                | Existing mechanism                                                                                          | Change described here                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Summary output      | Full summaries include complete trees; incremental summaries can reference unchanged subtrees with handles. | A load-time policy controls when full output is required.                                                   |
| Summary tracking    | Summarizer nodes track proposals and accept their state after acknowledgment.                               | GC state is also associated with each submitted proposal, including full summaries.                         |
| GC recovery         | Recovery requests a full GC run and waits for its summary acknowledgment.                                   | Recovery generations prevent an older acknowledgment from clearing a newer request.                         |
| Application content | DDSs provide their summary subtrees.                                                                        | A new callback adds an application subtree and updates its reuse state after the same proposal is accepted. |

The GC tracking and recovery changes are general runtime corrections, not special handling enabled only for seed files.
They form a prerequisite review boundary separate from the application callback and example application.
The remaining sections describe the resulting behavior, rather than implying that all of it existed before these changes.

## Full output, tracking, and accepted parents

A summary handle references a subtree or blob path in a previously stored summary, called the parent.
It is valid only when the content being reused matches the state captured for that parent.
A summary describes the document after processing operations through its reference sequence number.

An application can construct DDS state from application content instead of loading DDS subtrees from a stored summary.
In that case, the generated DDS summary paths do not yet exist in storage.
The first accepted summary must write those trees before later summaries can reuse them by handle.
See the [application loading example][application-design] for this use of the general full-output policy.

`ISummaryGenerationOptions.fullTreePolicy` selects one of three output policies:

| Value                    | Behavior                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `"default"` (or omitted) | Use normal summary behavior, including incremental subtree reuse when possible.             |
| `"untilFirstAck"`        | Require full output until this runtime's tracked full proposal is acknowledged and adopted. |
| `"always"`               | Require full output for the runtime's lifetime.                                             |

An explicit per-attempt `fullTree: true` request remains effective with any policy.
`shouldProduceFullSummary()` in [summary generation](src/summary/summaryGeneration.ts) evaluates the request and policy.
The runtime propagates the result to data-store and DDS summaries, GC serialization, and any application projection callback.
Unconditional forcing is not cleared by acceptance.

With `untilFirstAck` and summary heuristics enabled, the elected summarizer requests an initial summary without waiting for an application edit.
An attached interactive client requests writer participation through the optional loader `requestWriteConnection` hook so it can participate in election.
This does not submit a dummy operation, bypass permissions, or connect a container that the host kept disconnected.
The attempt uses normal submission, retry, cancellation, and acknowledgment processing.
After full adoption, ordinary incremental generation and scheduling resume.
Disabled heuristics and on-demand scheduling still require an explicit summary request; disabled summarization does not start a summarizer.
Omitting the policy or selecting `default` does not request initial writer participation or an initial summary.

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

ContainerRuntime invokes completion and cleanup alongside summarizer-node hooks.
Cleanup removes only work in progress; submitted proposals remain eligible for delayed acknowledgments.
Proposal handles distinguish attempts at the same reference sequence number.
Retirement removes proposals with older reference sequence numbers consistently with summarizer-node tracking,
not another proposal merely because its reference sequence number is equal.

## Coordinated acceptance

`ContainerRuntime.refreshLatestSummaryAck()` serializes acceptance work.
A new generation is blocked while acceptance is in progress.
For a locally tracked proposal it:

1. Refreshes summarizer nodes.
2. Verifies the captured generation matches the proposal and reference sequence number.
3. Refreshes that proposal's GC state.
4. Records the accepted parent: proposal handle, acknowledgment handle, and reference sequence number.
5. Invokes that proposal's optional synchronous application acceptance callback.
6. Ends temporary full-tree forcing if the accepted generation was full.

A remote or untracked acknowledgment does not manufacture a local baseline.
The existing fetch-latest/close handling remains applicable to a newer remote summary.
Duplicate acknowledgments cannot promote an already-adopted application callback again.

If summarizer-node, GC, or application adoption fails,
the runtime closes rather than continuing with inconsistent reuse state.
This is fail-closed coordination, not transactional rollback of state already adopted by summarizer nodes.

## Recovery generations

GC auto-recovery requests a full reachability run and waits for a summary covering that recovery to be accepted.
An older proposal's delayed acknowledgment must not clear a newer request.
Each recovery request increments a local generation; a completed run exposes that generation to summary capture.
Only adoption of a proposal carrying the current completed generation clears the request.

`IGCSummaryTrackingData.recoveryGeneration` is in-memory bookkeeping, not a new stored GC field.
The GC blob layout and handle paths remain unchanged.
The mechanism coordinates persistence and recovery; it does not introduce a new reachability model.

## Application projection participation

`ISummaryGenerationOptions.additionalRootTree` registers the name of the application-provided subtree
and callbacks named after the corresponding ContainerRuntime summary APIs:

| Callback | Called for | Result |
| --- | --- | --- |
| `summarize` | Normal asynchronous summary generation, including direct `runtime.summarize()` calls. | Required tree result, returned directly or through a promise. |
| Optional `createSummary` | Synchronous attachment capture and detached-container serialization. | Synchronous tree result, or `undefined` to omit the subtree. |

Both callbacks receive `ISummaryGenerationContext`,
including the reference sequence number, effective full-tree/tracking policy, and exact accepted parent.
Their tree result is `IApplicationProjectionSummary`:
an opaque application-owned tree and an optional proposal-specific `onAccepted` callback.
The runtime treats the subtree's content as opaque.

Normal generation awaits `summarize` before uploading or submitting the summary.
It can asynchronously realize and serialize application components, but all reads must describe the same checkpoint
as the DDS summary. Neither callback may mutate shared state, emit operations, or initiate schema changes.
Normal submission holds its existing inbound-processing pause through projection generation.
That pause does not freeze arbitrary application inputs or prevent local writes; asynchronous exporters must not
mix revisions across awaits. Direct `runtime.summarize()` callers must provide equivalent consistency themselves.
The runtime rejects projection results if the runtime closed, the sequenced checkpoint moved,
or the accepted parent changed while the callback awaited.
Required projection failures abort the attempt rather than publishing missing or stale content.
Awaited work extends the summary pause, so prepare dependencies ahead of time where practical.
Do not await incoming operations or acknowledgments while processing is paused.
Cancellation is checked after application work settles; existing summary timeouts do not cancel the callback's promise.
The callback must arrange for its own I/O to complete or reject.

`createSummary` never calls or falls back to `summarize`. Its dependencies must already be realized.
An omitted callback or explicit `undefined` omits the root entirely; an empty tree writes an empty root instead.
An application using omission can attach an ordinary DDS-backed file without a readable projection;
a subsequent accepted normal summary supplies it. External seed creation is independent and still supplies its own seed.

No synchronous reason argument is exposed: the existing runtime API does not reliably distinguish attachment
from detached serialization, and these existing APIs are unchanged.
Attached `getPendingLocalState()` does not call either projection callback. Omitting a new projection does not
remove projection blobs or seed dependencies already retained in the pending snapshot.

Acceptance promotes state captured for that proposal, not current mutable state.
`onAccepted` remains synchronous and is never invoked for attachment or direct summaries.
The normal callback still runs when data-store or DDS subtrees reuse handles;
full output or a missing valid parent prohibits application handles.

See the [application projection design][application-design] for one consumer of this contract.
GC tracking remains independent of that application.

[application-design]: ../../../docs/content/Architecture/Application-Projections/Fluid-Design.md

## Source and regression map

| Source                                                               | Responsibility                                                              | Focused coverage                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`summaryGenerationTypes.ts`](src/summary/summaryGenerationTypes.ts) | Summary policy, callback context, and generation options.                   | Package type and API-report checks verify the exported contracts.                                                                                                                                                              |
| [`summaryGeneration.ts`](src/summary/summaryGeneration.ts)           | Policy evaluation, proposal bookkeeping, and application acceptance.        | [`containerRuntime.summaryGeneration.spec.ts`](src/test/containerRuntime.summaryGeneration.spec.ts): retries, delayed adoption, remote/duplicate acknowledgments, explicit full requests, callbacks, and handle preconditions. |
| [`containerRuntime.ts`](src/containerRuntime.ts)                     | Connects summary generation and acceptance to runtime/DDS summaries and GC. | The runtime summary tests exercise the public loading and summarization paths, including cleanup failure telemetry.                                                                                                            |
| [`gcSummaryStateTracker.ts`](src/gc/gcSummaryStateTracker.ts)        | Full tracked capture, submitted proposals, and accepted GC state.           | [`gcSummaryStateTracker.spec.ts`](src/test/gc/gcSummaryStateTracker.spec.ts): adopt A after B and abandoned/untracked work, then independently adopt B.                                                                        |
| [`garbageCollection.ts`](src/gc/garbageCollection.ts)                | Forward policy/proposal identity and correlate recovery.                    | [`garbageCollection.spec.ts`](src/test/gc/garbageCollection.spec.ts): early/older recovery acknowledgments retain the request; the matching accepted generation clears it.                                                     |
| [`gcDefinitions.ts`](src/gc/gcDefinitions.ts)                        | Runtime/GC completion, cleanup, and proposal-aware refresh contract.        | The runtime and GC suites exercise the shared lifecycle without depending on a content format.                                                                                                                                 |
