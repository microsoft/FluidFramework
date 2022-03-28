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

- `throttlerDelay` - throttle delay in ms (does not include initial delay)
- `initialDelay` - initial delay in ms
- `opsSinceLastAck` - count of ops since last summary ack, reported by SummaryCollection. This can be relevant for the initial delay bypass logic.
- `opsToBypassInitialDelay` - count of ops since last summary ack that allow us to bypass the initial delay

### RunningSummarizer

> Performance

The parent client elected as responsible for summaries tracks the life cycle of its spawned summarizer client.

This event starts when calling `run()` on the spawned summarizer client's `ISummarizer`.

This event ends when that `run()` call's resulting promise is fulfilled. This happens when the client closes.

- `attempt` - number of attempts within the last time window, used for calculating the throttle delay.

### SummarizerException

> Error

Exception raised during summarization.

- `category` - string that categorizes the exception ("generic" or "error")

### EndingSummarizer

Logs after summarizer has stopped running, i.e., after the client has disconnected or stop has been requested

- `reason` - the reason for stopping, returned by Summarizer.run

## Summarizer Client Election

> Event Prefix: `OrderedClientElection:`

### ElectedClientNotSummarizing

> Error

When a client is elected the summarizer, this indicates that too many ops have passed since they were elected or since their latest successful summary ack if they have one.

- `electedClientId` - the client ID of the elected parent client responsible for summaries which is not summarizing.
- `lastSummaryAckSeqForClient` - the sequence number of the last summary ack received during this client's election.
- `electionSequenceNumber` - the sequence number at which this failing client was elected.
- `nextElectedClientId` - the client ID of the next oldest client in the Quorum which is eligible to be elected as responsible for summaries. It may be undefined if the currently elected client is the youngest (or only) client in the Quorum.
- `electionEnabled` - election of a new client on logging this error is enabled

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

> Event Prefix: `OrderedClientCollection:`

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

### RunningSummarizer

Summarizer has started running. This happens when the summarizer client becomes connected with write permissions, and `run()` has been called on it. At this point in time it will create a `RunningSummarizer` and start updating its state in response to summary ack ops.

- `onBehalfOf` - the last known client ID of the parent client which spawned this summarizer client.
- `initSummarySeqNumber` - initial sequence number that the summarizer client loaded from

### HandleSummaryAckError

> Error

An error was encountered while watching for or handling an inbound summary ack op.

- `referenceSequenceNumber` - reference sequence number of the summary ack we are handling if the error occurs during `refreshLatestSummaryAck` (most likely). It could be the reference sequence number of the previously handled one + 1 (defaulting to initial sequence number if this is the first) if the error occurs while waiting for the summary ack (indicating a bug in `SummaryCollection`), but that should be significantly less likely.

### HandleSummaryAckFatalError

> Unexpected Error

This should not even be possible, but it means that an unhandled error was raised while listening for summary ack ops in a loop. This is particularly unexpected, because if any handling of a summary ack fails, then we catch that error already and keep going, logging a different error.

## Running Summarizer

> Event Prefix: `Summarizer:Running:`

- `summarizeCount` - the number of summarize attempts this client has made. This can be used to correlate events for individual summary attempts.
- `summarizerSuccessfulAttempts` - the number of successful summaries this summarizer instance has performed. This property subtracted from the `summarizeCount` property equals the number of attempts that failed to produce a summary.

### SummaryAckWaitTimeout

> Error

When a summary op is sent, the summarizer waits `summaryAckWaitTimeout` for a summary ack/nack op in response from the server. If a corresponding response is not seen within that time, this event is raised, and the client retries.

- `maxAckWaitTime` - cap on the maximum amount of time client will wait for a summarize op ack
- `referenceSequenceNumber` - last attempt summary op reference sequence number.
- `summarySequenceNumber` - last attempt summary op sequence number.
- `timePending` - time spent waiting for a summary ack/nack as computed by client.

### MissingSummaryAckFoundByOps

During first load, the wait for a summary ack/nack op in response to a summary op, can be bypassed by comparing the op timestamps. Normally a timer is used while running, but if the server-stamped op time difference exceeds the `maxAckWaitTimeout`, then raise this event, clear the timer and stop waiting to start.

- `referenceSequenceNumber` - last attempt summary op reference sequence number.
- `summarySequenceNumber` - last attempt summary op sequence number.

### SummarizeAttemptDelay

Logs the presence of a delay before attempting summary. Note that the event is logged before waiting for the delay.

- `duration` - duration delay in seconds. This is the `retryAfter` value found in the summary nack response op, if present.
Otherwise, it's the delay from regular summarize attempt retry.
- `reason` - "nack with retryAfter" if the `duration` value came from a summary nack response op. Undefined otherwise.

### FailToSummarize

> Error

All consecutive retry attempts to summarize by heuristics have failed. The summarizer client should stop itself with "failToSummarize" reason code, closing the container.

- `summarizeReason` - reason for attempting to summarize
- `message` - message returned with the last summarize result

### UnexpectedSummarizeError

> Unexpected Error

This should not be possible, but it indicates an error was thrown in the code that runs immediately after a summarize attempt. This is just lock release and checking if it should summarize again.

## Summary Generator

> Event Prefix: `Summarizer:Running:`

- `summarizeCount` - the number of summarize attempts this client has made. This can be used to correlate events for individual summary attempts.
- `summarizerSuccessfulAttempts` - the number of successful summaries this summarizer instance has performed

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

  - `disconnect` - the summary op was submitted but broadcast was cancelled.
  - `submitSummaryFailure` - the attempt failed to submit the summary op.
  - `summaryOpWaitTimeout` - timeout while waiting to receive the submitted summary op broadcasted.
  - `summaryAckWaitTimeout` - timeout while waiting to receive a summary ack/nack op in response to this attempt's summary op.
  - `summaryNack` - attempt was rejected by server via a summary nack op.
  - `summaryAck` - attempt was successful, and the summary ack op was received.

- `ackWaitDuration` (ack/nack received only) - time in ms spent waiting for the summary ack/nack op after submitting the summary op.
- `ackNackSequenceNumber` (ack/nack received only) - sequence number of the summary ack/nack op in response to this attempt's summary op.
- `summarySequenceNumber` (ack/nack received only) - sequence number of this attempt's summary op.
- `handle` (ack only) - summary handle found on this attempt's summary ack op.

### Summarize_generate

This event fires during a summary attempt, as soon as the ContainerRuntime has finished its summarize work, which consists of: generating the tree, uploading to storage, and submitting the op. It should fire this event even if something goes wrong during those steps.

- `fullTree` - flag indicating whether the attempt should generate a full summary tree without any handles for unchanged subtrees.
- `timeSinceLastAttempt` - time in ms since the last summary attempt (whether it failed or succeeded) for this client.
- `timeSinceLastSummary` - time in ms since the last successful summary attempt for this client.
- `referenceSequenceNumber` - reference sequence number at the time of this summary attempt.
- `opsSinceLastAttempt` - number of ops that have elapsed since the the last summarize attempt for this client.
- `opsSinceLastSummary` - number of ops that have elapsed since the last successful summarize attempt for this client.
- several properties with summary stats (count of nodes in the tree, etc.)
- `generateDuration` (only if tree generated) - time in ms it took to generate the summary tree.
- `handle` (only if uploaded to storage) - proposed summary handle as returned by storage for this summary attempt.
- `uploadDuration` (only if uploaded to storage) - time in ms it took to upload the summary tree to storage and receive back a handle.
- `clientSequenceNumber` (only if summary op submitted) - client sequence number of summary op submitted for this attempt. This can be used to correlate the submit attempt with the received summary op after it is broadcasted.

### IncrementalSummaryViolation

> Error

Fires if an incremental summary (i.e., not full tree) summarizes more data stores than the expected maximum number

- `summarizedDataStoreCount` - number of data stores actually summarized
- `gcStateUpdatedDataStoreCount` - number of data stores with an updated GC state since the last summary
- `opsSinceLastSummary` - number of ops since the last summary

### Summarize_Op

This event fires during a summary attempt, as soon as the client observes its own summary op. This means that the summary op it submitted was sequenced and broadcasted by the server.

- `duration` - time in ms spent waiting for the summary op to be broadcast after submitting it. This should be low; should represent the round-trip time for an op.
- `referenceSequenceNumber` - reference sequence number of the summary op. This should match the reference sequence number of the Summarize event for this attempt as well.
- `summarySequenceNumber` - server-stamped sequence number of the summary op for this attempt.
- `handle` - proposed summary tree handle on the summary op for this attempt, which was originally returned from storage.

### SummaryNack

> Error

Fires if the summary receives a nack response

- `fullTree` - flag indicating whether the attempt should generate a full summary tree without any handles for unchanged subtrees.
- `timeSinceLastAttempt` - time in ms since the last summary attempt (whether it failed or succeeded) for this client.
- `timeSinceLastSummary` - time in ms since the last successful summary attempt for this client.
- `referenceSequenceNumber` - reference sequence number at the time of this summary attempt.
- `opsSinceLastAttempt` - number of ops that have elapsed since the the last summarize attempt for this client.
- `opsSinceLastSummary` - number of ops that have elapsed since the last successful summarize attempt for this client.
- several properties with summary stats (count of nodes in the tree, etc.)
- `generateDuration` (only if tree generated) - time in ms it took to generate the summary tree.
- `handle` (only if uploaded to storage) - proposed summary handle as returned by storage for this summary attempt.
- `uploadDuration` (only if uploaded to storage) - time in ms it took to upload the summary tree to storage and receive back a handle.
- `clientSequenceNumber` (only if summary op submitted) - client sequence number of summary op submitted for this attempt. This can be used to correlate the submit attempt with the received summary op after it is broadcasted.
- `retryAfterSeconds` - time in seconds to wait before retrying, as read from the nack message

### SummarizeTimeout

> Performance

This event can fire multiple times (up to a cap) per summarize attempt. It indicates that a lot of time has passed during the summarize attempt.

For example, after 20 seconds of summarizing this event might fire. Then after another 40 seconds pass, it will fire again. Then after another 80 seconds pass, it will fire again. The third time that it logged, a total time of 140 seconds has passed.

- `timeoutTime` - time in ms for this timeout to occur, this counts since the previous timeout event for this summarize attempt, so it is not cumulative.
- `timeoutCount` - number of times this event has fired for this attempt.

## SummarizerNode

Should use the in-progress summarize attempt correlated logger.

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

### SequenceNumberMismatch

> Error

Fires during ContainerRuntime load from snapshot if the sequence number read from the snapshot does not match DeltaManager.initialSequenceNumber.

### SummariesDisabled

Fires during ContainerRuntime load if automatic summaries are disabled for the given Container

### SummaryStatus:Behind

> Error

Fires if too many ops (7000 by default) have been processed since the last summary.

### SummaryStatus:CaughtUp

Fires if, after a previous `SummaryStatus:Behind` event, a summary ack is received

### RefreshLatestSummaryGetSnapshot

> Performance

This event fires while fetching a snapshot from storage during the summarizer refresh latest summary flow. This happens when `refreshLatestAck` parameter is passed to summarize, or a summary ack was received with a handle that the client does not have local state for.

- `ackHandle` - handle of the summary ack
- `fetchLatest` - true if triggered by `refreshLatestAck`, false if triggered by handling a summary ack handle.
- `summaryRefSeq` - reference sequence number of the summary

### WaitingForSeq

> Performance

This event fires when the sequence number of the latest summary (equivalent to the reference sequence number of its summary op) exceeds the current sequence number at the time of the summarize attempt. When this happens, we process ops until we are caught up. Then we pause the inbound ops like normal.

Although this should be unlikely, it is possible only when `refreshLatestAck` is true. Because we are asking the server for the latest successful summary, it may be that we haven't caught up to the latest summary yet.

- `lastSequenceNumber` - last observed sequence number at the time of waiting.
- `targetSequenceNumber` - sequence number that we are waiting for. This is the sequence number found in the latest summary that we are aware of.
- `lastKnownSeqNumber` - last known sequence number by the DeltaManager. This can be relevant to give an idea of the current DeltaManager state vs. runtime state at the time of trying to summarize.

### LastSequenceMismatch

> Error

Fires on summary submit if the summary sequence number does not match the sequence number of the last message processsed by the Delta Manager.

- `error` - error message containing the mismatched sequence numbers

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
