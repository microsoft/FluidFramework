---
title: Summary telemetry
menuPosition: 9
draft: true
---

## Summary Collection

The core data structure that tracks summary attempts and corresponding results by monitoring the op log.

### SummaryAckWithoutOp

> Error

It means that a summary ack was observed without a corresponding summary op. We only raise this event if the missing summary op's sequence number >= the initial sequence number which we loaded from.

Potential causes are that a summary op was nacked then acked, double-acked, or the `summarySequenceNumber` is invalid. All cases should be recoverable, but still indicate bad behavior.

- `sequenceNumber` - sequence number of the observed summary ack op.
- `summarySequenceNumber` - sequence number of the missing summary op, as indicated by the summary ack op.
- `initialSequenceNumber` - sequence number we initially loaded from. This is relevant since it is compared with the missing summary op sequence number to determine if we are in an error case or not.

## Summary Manager

> Event Prefix: `SummaryManager:`

### CreatingSummarizer

Logs right before attempting to spawn summarizer client.

- `delayMs` - throttle delay in ms (does not include initial delay)
- `opsSinceLastAck` - count of ops since last summary ack, reported by SummaryCollection. This can be relevant for the initial delay bypass logic.

### CreateSummarizerError

> Error

Error encountered while creating the summarizer client.

- `attempt` - number of attempts within the last time window, used for calculating the throttle delay.

### RunningSummarizer

> Performance

The parent client elected as responsible for summaries tracks the life cycle of its spawned summarizer client.

This event starts when calling `run()` on the spawned summarizer client's `ISummarizer`.

This event ends when that `run()` call's resulting promise is fulfilled. This happens when the client closes.

- `attempt` - number of attempts within the last time window, used for calculating the throttle delay.

### StopCalledWithoutRunningSummarizer

> Unexpected Error

Indicates that the state machine is broken, so this is unexpected. It should only be possible to call the private `stop()` function while the class has a defined running summarizer, which it would normally try to stop. Normally we would stay in the Stopping state while waiting for it to stop, but when this error case is encountered, we immediately synchronously proceed to the Off state.

- `reason` - the SummarizerStopReason that was provided for this call.

## Summarizer Client Election

> Event Prefix: `OrderedClientElection:`

### ElectedClientNotSummarizing

> Error

When a client is elected the summarizer, this indicates that too many ops have passed since they were elected or since their latest successful summary ack if they have one.

- `electedClientId` - the client ID of the elected parent client responsible for summaries which is not summarizing.
- `lastSummaryAckSeqForClient` - the sequence number of the last summary ack received during this client's election.
- `electionSequenceNumber` - the sequence number at which this failing client was elected.
- `nextElectedClientId` - the client ID of the next oldest client in the Quorum which is eligible to be elected as responsible for summaries. It may be undefined if the currently elected client is the youngest (or only) client in the Quorum.

### UnexpectedElectionSequenceNumber

> Unexpected Error

Verifies the state transitioned as expected, based on assumptions about how `OrderedClientElection` works.

- `lastSummaryAckSeqForClient` - expected to be undefined!
- `electionSequenceNumber` - expected to be same as op sequence number!

## Ordered Client Election

> Event Prefix: `OrderedClientElection:`

### InitialElectedClientNotFound

> Error

Failed to find the initially elected client determined by the state in the summary. This is unexpected, and likely indicates a discrepancy between the `Quorum` members and the `SummarizerClientElection` state at the time the summary was generated.

When this error happens, no client will be elected at the start. The code in `SummarizerClientElection` should still recover from this scenario.

- `electionSequenceNumber` - sequence number which the initially elected client was supposedly elected as of. This is coming from the initial state loaded from the summary.
- `expectedClientId` - client ID of the initially elected client which was not found in the underlying `OrderedClientCollection`. This is coming from the base summary.
- `electedClientId` - the client which will now be elected; always undefined.
- `clientCount` - the number of clients in the underlying `OrderedClientCollection`, which should be the same as the number of clients in the `Quorum` at the time of load.

### InitialElectedClientIneligible

> Error

The initially elected client determined by the summary fails the eligibility check. Presumably they must have passed it at the time the summary was generated and they were originally elected. So this indicates a discrepancy/change between the eligibility or a bug in the code.

When this error happens, the first eligible client that is younger than this client will be elected.

- `electionSequenceNumber` - sequence number which the initially elected client was elected as of. This is coming from the initial state loaded from the summary.
- `expectedClientId` - client ID of the initially elected client which is failing the eligibility check. This is coming from the base summary.
- `electedClientId` - client ID of the newly elected client or undefined if no younger clients are eligible.

## Ordered Client Collection

> Event Prefix: `OrderedClientElection:`

## ClientNotFound

> Error

A member of the `Quorum` was removed, but it was not found in the `OrderedClientCollection`. This should not be possible, since the tracked clients in the `OrderedClientCollection` should match 1-1 to the clients in the `Quorum`.

- `clientId` - client ID of the member removed from the `Quorum`.
- `sequenceNumber` - sequence number at the time when the member was removed from the `Quorum`. This should be equivalent to the sequence number of their leave op, since that is what triggers them exiting the `Quorum`.

## Summarizer

> Event Prefix: `Summarizer:`

### StoppingSummarizer

This event fires when the Summarizer is stopped.

- `reason` - reason code provided for stopping.
- `onBehalfOf` - the last known client ID of the parent client which spawned this summarizer client.

### NotStarted

This event fires when the Summarizer is trying to start, but never gets running. It is caused by the client being disconnected or not being able to write. Because the summarizer client is never able to reconnect after disconnecting once, it closes immediately with this event if it knows it should never be able to start.

- `reason` - code to indicate why it could never finish starting; possible values:
  - `DisconnectedBeforeRun` - client was connected at some point, but then disconnected before the Summarizer started.
  - `NeverConnectedBeforeRun` - client never became connected, but the Summarizer was stopped.
  - `CannotWrite` - client became connected, but cannot write.
  - `DifferentComputedSummarizer` - right before starting, the summarizer client verifies that its parent client is elected by this client's own calculations. If it doesn't match after connecting, it prevents this summarizer from starting.
- `onBehalfOf` - the last known client ID of the parent client which spawned this summarizer client.
- `computedSummarizer` - (`DifferentComputedSummarizer` only) client ID of the elected summarizer client by the summarizer client's calculations.
- `clientId` - (`DifferentComputedSummarizer` only) client ID of this summarizer client.

### RunningSummarizer

Summarizer has started running. This happens when the summarizer client becomes connected with write permissions, and `run()` has been called on it. At this point in time it will create a `RunningSummarizer` and start updating its state in response to summary ack ops.

- `onBehalfOf` - the last known client ID of the parent client which spawned this summarizer client.
- `initSummarySeqNumber` - initial sequence number that the summarizer client loaded from

### HandleSummaryAckError

> Error

An error was encountered while watching for or handling an inbound summary ack op.

- `refSequenceNumber` - reference sequence number of the summary ack we are handling if the error occurs during `refreshLatestSummaryAck` (most likely). It could be the reference sequence number of the previously handled one + 1 (defaulting to initial sequence number if this is the first) if the error occurs while waiting for the summary ack (indicating a bug in `SummaryCollection`), but that should be significantly less likely.

### HandleSummaryAckFatalError

> Unexpected Error

This should not even be possible, but it means that an unhandled error was raised while listening for summary ack ops in a loop. This is particularly unexpected, because if any handling of a summary ack fails, then we catch that error already and keep going, logging a different error.

## Running Summarizer

> Event Prefix: `Summarizer:Running:`

- `summaryGenTag` - the number of summarize attempts this client has made. This can be used to correlate events for individual summary attempts.

### SummaryAckWaitTimeout

> Error

When a summary op is sent, the summarizer waits `summaryAckWaitTimeout` for a summary ack/nack op in response from the server. If a corresponding response is not seen within that time, this event is raised, and the client retries.

- `refSequenceNumber` - last attempt summary op reference sequence number.
- `summarySequenceNumber` - last attempt summary op sequence number.
- `timePending` - time spent waiting for a summary ack/nack as computed by client.

### MissingSummaryAckFoundByOps

During first load, the wait for a summary ack/nack op in response to a summary op, can be bypassed by comparing the op timestamps. Normally a timer is used while running, but if the server-stamped op time difference exceeds the `maxAckWaitTimeout`, then raise this event, clear the timer and stop waiting to start.

- `refSequenceNumber` - last attempt summary op reference sequence number.
- `summarySequenceNumber` - last attempt summary op sequence number.

### SummarizeAttemptDelay

- `retryAfterSeconds` - delay from `retryAfter` found in the summary nack response op. This will override any regular delay time.
- `regularDelaySeconds` - delay from regular summarize attempt retry.

### FailToSummarize

> Error

All consecutive retry attempts to summarize by heuristics have failed. The summarizer client should stop itself with "failToSummarize" reason code, closing the container.

### UnexpectedSummarizeError

> Unexpected Error

This should not be possible, but it indicates an error was thrown in the code that runs immediately after a summarize attempt. This is just lock release and checking if it should summarize again.

## Summary Generator

> Event Prefix: `Summarizer:Running:`

- `summaryGenTag` - the number of summarize attempts this client has made. This can be used to correlate events for individual summary attempts.

### ConcurrentSummarizeAttempt

> Unexpected Error

This indicates a problem in the state machine, so these errors should be addressed with priority. We use locking to prevent concurrent summarize attempts, but the lock checking occurs at a higher layer, so if it reaches this far in, then something is wrong.

When this error occurs, it will immediately fail the attempt to summarize, so it's possible the client will recover itself.

- `reason` - reason code for attempting to summarize.

### UnexpectedSummarizeError

> Unexpected Error

This definitely should not happen, since the code that can trigger this is trivial.

### Summarize

> Performance

This event is used to track an individual summarize attempt from end to end.

The event starts when the summarize attempt is first started.

The event ends after a summary ack op is received in response to this attempt's summary op.

The event cancels in response to a summary nack op for this attempt, an error along the way, or if the client disconnects while summarizing.

- `reason` - reason code for attempting to summarize.
- `refreshLatestAck` - flag indicating whether the attempt should ask the server for the latest summary ack handle or not.
- `fullTree` - flag indicating whether the attempt should generate a full summary tree without any handles for unchanged subtrees.
- `timeSinceLastAttempt` - time in ms since the last summary attempt (whether it failed or succeeded) for this client.
- `timeSinceLastSummary` - time in ms since the last successful summary attempt for this client.

- `message` - message indicating result of summarize attempt; possible values:

  - `submitSummaryFailure` - the attempt failed to submit the summary op.
  - `summaryOpWaitTimeout` - timeout while waiting to receive the submitted summary op broadcasted.
  - `summaryAckWaitTimeout` - timeout while waiting to receive a summary ack/nack op in response to this attempt's summary op.
  - `summaryNack` - attempt was rejected by server via a summary nack op.
  - `summaryAck` - attempt was successful, and the summary ack op was received.

- `timeWaiting` (ack/nack received only) - time in ms spent waiting for the summary ack/nack op after submitting the summary op.
- `sequenceNumber` (ack/nack received only) - sequence number of the summary ack/nack op in response to this attempt's summary op.
- `summarySequenceNumber` (ack/nack received only) - sequence number of this attempt's summary op.
- `handle` (ack only) - summary handle found on this attempt's summary ack op.

### GenerateSummary

This event fires during a summary attempt, as soon as the ContainerRuntime has finished its summarize work, which consists of: generating the tree, uploading to storage, and submitting the op. It should fire this event even if something goes wrong during those steps.

- `refSequenceNumber` - reference sequence number at the time of this summary attempt.
- `opsSinceLastAttempt` - number of ops that have elapsed since the the last summarize attempt for this client.
- `opsSinceLastSummary` - number of ops that have elapsed since the last successful summarize attempt for this client.
- several properties with summary stats (count of nodes in the tree, etc.)
- `generateDuration` (only if tree generated) - time in ms it took to generate the summary tree.
- `handle` (only if uploaded to storage) - proposed summary handle as returned by storage for this summary attempt.
- `uploadDuration` (only if uploaded to storage) - time in ms it took to upload the summary tree to storage and receive back a handle.
- `clientSequenceNumber` (only if summary op submitted) - client sequence number of summary op submitted for this attempt. This can be used to correlate the submit attempt with the received summary op after it is broadcasted.
- `submitOpDuration` (only if summary op submitted) - time in ms it took to submit the summary op. This should be very low; perhaps not useful.

### SummaryOp

This event fires during a summary attempt, as soon as the client observes its own summary op. This means that the summary op it submitted was sequenced and broadcasted by the server.

- `timeWaiting` - time in ms spent waiting for the summary op to be broadcast after submitting it. This should be low; should represent the round-trip time for an op.
- `refSequenceNumber` - reference sequence number of the summary op. This should match the reference sequence number of the Summarize event for this attempt as well.
- `summarySequenceNumber` - server-stamped sequence number of the summary op for this attempt.
- `handle` - proposed summary tree handle on the summary op for this attempt, which was originally returned from storage.

### SummarizeTimeout

> Performance

This event can fire multiple times (up to a cap) per summarize attempt. It indicates that a lot of time has passed during the summarize attempt.

For example, after 20 seconds of summarizing this event might fire. Then after another 40 seconds pass, it will fire again. Then after another 80 seconds pass, it will fire again. The third time that it logged, a total time of 140 seconds has passed.

- `timeoutTime` - time in ms for this timeout to occur, this counts since the previous timeout event for this summarize attempt, so it is not cumulative.
- `timeoutCount` - number of times this event has fired for this attempt.

## SummarizerNode

Should use the in-progress summarize attempt correlated logger.

### SummarizingWithBasePlusOps

> Unexpected Error

This feature is disabled by code, so we shouldn't see this. It indicates that we are attempting to perform a differential summary. This event is just guarding that the disable feature is indeed working.

### DecodeSummaryMaxDepth

Differential summaries are disabled, so we aren't expecting to see this often, but it is possible since it happens while loading a snapshot.

Indicates >100 consecutive failed summaries for a single datastore. It means there are 100+ nested `_baseSummary` trees encountered while loading.

- `maxDecodeDepth` - 100

### DuplicateOutstandingOps

Differential summaries are disabled, so we aren't expecting to see this often, but it is possible since it happens while loading a snapshot.

When organizing the outstanding ops from the `_outstandingOps` blobs of nested differential summaries, it found an overlap in sequence number ranges. This indicates something went wrong.

- `message` - "newEarliestSeq <= latestSeq in decodeSummary: {newEarliestSeq} <= {latestSeq}"

## Container Runtime

Should use the in-progress summarize attempt correlated logger.

### RefreshLatestSummaryGetSnapshot

> Performance

This event fires while fetching a snapshot from storage during the summarizer refresh latest summary flow. This happens when `refreshLatestAck` parameter is passed to summarize, or a summary ack was received with a handle that the client does not have local state for.

- `fetchLatest` - true if triggered by `refreshLatestAck`, false if triggered by handling a summary ack handle.
- `getVersionDuration` - time in ms of asking storage for the version ID.
- `getSnapshotDuration` - time in ms of downloading the summary tree for storage.

### WaitingForSeq

> Performance

This event fires when the sequence number of the latest summary (equivalent to the reference sequence number of its summary op) exceeds the current sequence number at the time of the summarize attempt. When this happens, we process ops until we are caught up. Then we pause the inbound ops like normal.

Although this should be unlikely, it is possible only when `refreshLatestAck` is true. Because we are asking the server for the latest successful summary, it may be that we haven't caught up to the latest summary yet.

- `lastSequenceNumber` - last observed sequence number at the time of waiting.
- `targetSequenceNumber` - sequence number that we are waiting for. This is the sequence number found in the latest summary that we are aware of.
- `lastKnownSeqNumber` - last known sequence number by the DeltaManager. This can be relevant to give an idea of the current DeltaManager state vs. runtime state at the time of trying to summarize.

### GarbageCollection

> Performance

This event tracks the performance around the garbage collection process.

- `deletedNodes`
- `totalNodes`
- `deletedDataStores`
- `totalDataStores`

### MissingGCNode

> Disabled: too noisy

While running garbage collection, a node was detected as missing that is referenced.

- `missingNodeId`
