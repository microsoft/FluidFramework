# Shared Live Event Buffer Plan

Status: Proposed implementation plan; no implementation is included.
Written on 2026-09-22 against `rust-service` at `eb7a806ade5`.
Reconcile the source locations and contracts below with intervening changes before implementation.

## Objective

Extend the sequencer's bounded admission pipeline into one shared buffer for admission, backend publication, and live event delivery.
Serve caught-up readers from published entries instead of reading newly written events back from the journal.
Disconnect lagging live readers using the same current minimum-reference threshold used to reject stale writer references.
Let clients reconnect through existing catch-up and snapshot mechanisms.
Backpressure writer admission when the bounded buffer has no available capacity.

Separate the current enforcement floor from its ordered outbound announcement.
The server must be able to advance enforcement, disconnect readers, and reclaim eligible buffer entries without first enqueueing a floor update.
Clients use announced minimum-reference positions to release resources, not as a guarantee that a later write will be accepted.
Announcements can already become stale during a round trip; debouncing them does not introduce a new writer eligibility model.

## Evidence And Starting Point

The [file execution measurements](historical/measurements/file-execution-e2e-20260922/README.md) identify per-poll file-read offloading as a material CPU cost in the 32-document writer-and-observer workload.
The diagnostic inline-read variant reduced CPU use but violated filesystem isolation from async executors.
It is evidence for removing file reads from live delivery, not a deployable optimization or a predicted speedup for this design.

- [The admission pipeline](crates/sea-sequencer/src/pipeline.rs) bounds queued and in-flight application submissions at 256 entries and 4 MiB.
  It releases charges after completion and does not retain published events for readers.
  Its idle fast path can bypass queue insertion.
- [The session implementation](crates/sea-sequencer/src/session.rs) prepares references against committed runtime state, publishes application and membership events, and opens archive-backed readers.
  Its current floor proposal uses a 1024-entry lag window, a 64-entry advance condition, and a cap at the submitting reference.
  Those conditions must be revisited for an independently advancing enforcement floor.
- [File storage](crates/sea-file/src/storage.rs) provides journal-backed event streams.
  [The blocking adapter](crates/sea-file/src/common.rs) moves their polls off async executor threads.
  Keep that mechanism for historical reads; do not replace it with inline filesystem access.
- [Server liveness configuration](crates/sea-webtransport-server/src/server.rs) exposes `max_event_lag`.
  Verify its actual enforcement and consumers before reusing, redefining, or removing it; its presence alone does not establish a working eviction mechanism.
- [The Fluid session client](packages/sea-driver/src/sessionClient.ts) has a reconnect hook that waits for disposal before a subsequent open obtains a fresh session.
  Verify the complete disconnect, reopen, catch-up, and live handoff path rather than treating that hook as proof of automatic recovery.

## Scope

Keep the buffer and floor policy in the sequencer, where ordering, membership, and reference validation are owned.
Use the same delivery semantics with memory, buffered-file, and durable-file storage.
Keep backend-specific persistence and filesystem scheduling inside storage implementations.

Preserve backend acknowledgment guarantees, opaque `EventPosition` values, journal and checkpoint compatibility where possible, and client-owned snapshot selection.
An event position is not an integer event count; file positions are byte offsets.
Use counts and charged bytes for resource limits and position comparisons for ordering.

Do not add a second durable payload cache or automatically move an evicted live reader back to journal replay.
Historical and finite archive reads remain supported.
This work does not include storage compaction, durable group commit, or a new snapshot selection policy.
Prefer existing protocol messages and error classifications; identify any necessary wire or public-contract change before implementing it.

## Required Invariants

1. Readers observe only events published under the selected backend's existing guarantees.
   Durable storage must complete its durability barriers first; buffered storage may publish before physical persistence under its existing contract.
2. Every ordered event kind, including membership and other control events, passes through the shared publication accounting.
   The idle application fast path must not bypass live delivery or capacity accounting.
3. Payload retention is shared among readers, not duplicated in an unbounded per-reader queue.
   Serialization copies, outstanding sends, and backend-owned write buffers have explicit bounded ownership even where sharing is impractical.
4. The enforcement floor and the last enqueued announcement are monotonic within a runtime, and the enqueued floor never exceeds enforcement.
5. An announced floor is an ordered cleanup guarantee.
   No event ordered after that announcement may require reference state below it.
   The event carrying an announcement must also satisfy the current event-format and reference invariants.
6. A submission with a reference equal to the enforcement floor remains eligible; a lower reference is rejected.
   A live reader that has consumed through that floor is not evicted merely for equality.
7. Advancing enforcement, detaching lagging readers, and releasing their retention claims never require free event-buffer capacity.
8. Admission waits do not hold locks or lifecycle gates needed by publication, reader progress, eviction, or capacity release.
9. Cancellation after acceptance does not discard accepted work or release its charge early.
   Uncertain append outcomes preserve the existing fail-stop and recovery behavior.
10. Catch-up and finite historical reads are not subject to live-reader lag eviction before a successful live handoff.

## Buffer Ownership And Accounting

Evolve the existing pipeline rather than adding a parallel live cache.
Keep a bounded ordered collection with explicit states for admitted input, prepared or in-flight output, and published output.
Track the publication boundary, oldest retained entry, and each live reader's next required entry.
Positions become available from the backend append result; do not fabricate journal offsets for queued submissions.

Retain the final committed representation needed by readers, including resolved session metadata and floor announcements.
An original `EventSubmission` alone is insufficient.
Reuse immutable payload allocations where practical and charge transient input-to-output overlap conservatively.
Keep separate accounting for unfinished work and published retention within one total budget, so persistence completion can release admission capacity without incorrectly releasing reader-owned data.

Published entries can be reclaimed once no live reader or accounted downstream handoff needs them.
The minimum-reference floor is an eviction threshold, not a requirement to retain all entries at or above it.
With no live readers, settled entries need not remain in the sequencer buffer.
Buffered storage must retain any bytes it still needs for write-behind under its own existing bounded ownership.

Reject an individually oversized input deterministically rather than waiting for impossible capacity.
Bound waiting admissions as well as accepted entries; transport handlers must not accumulate unlimited uncharged payloads while waiting.
Wake waiting writers when readers advance, readers detach, entries settle, or the runtime terminates.

## Enforcement And Announcement Floors

### Enforcement

Maintain a current enforcement floor independently of outbound queue insertion.
Advance it monotonically using already published, valid reference positions and an explicit lag policy.
Use it for stale-reference rejection and lagging live-reader disconnection.
Do not derive the new floor from uncommitted positions or cap it at a stale writer's proposed reference.

Define the lag policy in both event-count and byte terms so variable payload sizes and control events cannot defeat the resource bound.
Select a valid application-reference position when the threshold crosses control events.
The same resulting floor governs readers and writers; do not introduce a separate reader-only eviction threshold.

Choose limits together with the total buffer budget and bounded space needed for in-flight work and lifecycle events.
The existing 1024-entry lag rule cannot simply be placed on a 256-entry retained buffer and assumed to make progress.
Specify how the lag policy permits eviction before published retention consumes all usable capacity, including rounding to referenceable positions and batched floor advancement.
Remove or adapt any debounce condition that would prevent this progress; debounce the announcement instead.
If a proposed policy cannot satisfy these constraints, resolve that policy before proceeding with the buffer implementation.

### Ordered Announcements

Track the last floor successfully inserted into the ordered event stream separately from enforcement.
Coalesce newer desired announcements to the highest current floor until a suitable outbound event can carry one.
Do not advance the enqueued value on an unsuccessful insertion or modify an already enqueued event.
Continue using existing floor-bearing event representations where they satisfy the ordering rules.
Do not require a dedicated update event merely to release memory.

Distinguish a submission waiting for capacity, a queue-admitted input, and an accepted/prepared ordered event.
Document the exact validation and ordering point.
Inputs not yet accepted for sequencing may be validated against newer enforcement.
Already accepted events must remain ahead of an announcement that would invalidate their references; do not silently reinterpret acceptance.
Lifecycle events and batches must obey the same rule, including events admitted before an enforcement advance but persisted afterward.

Enqueued is not durable.
Retain the existing committed/checkpointed floor as recovery state, separate from these runtime observations.
On restart, initialize enforcement and announcement tracking from recovered committed history, not from lost runtime-only advances.
This may discard an unannounced enforcement advance, but must never roll back a committed cleanup guarantee.
Test checkpoint replay and uncertain append recovery before claiming compatibility without a format change.

## Backpressure And Progress

When admission reaches capacity, apply the current lag policy, detach eligible live readers, and reclaim published entries whose retention claims are gone.
These operations update runtime state directly and must not enqueue a leave or floor event before releasing capacity.
Any required ordered membership event follows through a bounded lifecycle path that preserves event order and cannot itself deadlock on the full application queue.
Account for pending cleanup work; moving it to an unbounded side queue is not a solution.

If remaining capacity is occupied by accepted but unpublished work, wait for backend settlement.
If a reader remains within the permitted lag window, reader progress may release capacity without disconnection.
Keep pressure distinct from backend failure and from an invalid writer reference.
Use deterministic scheduling tests to prove that a stopped reader cannot prevent the transition that makes its retained entries reclaimable.

The two-floor split removes the dependency on publishing a notification before eviction.
It does not by itself prove that the lag threshold is reachable, that outstanding sends release payload ownership, or that persistence can progress while admission waits.
Those are separate acceptance requirements.

## Reader Lifecycle

### Catch-Up And Live Handoff

Start behind-tail readers on the existing journal-backed path, optionally after a client-selected snapshot.
Keep historical reads lazy and preserve finite `stop_after` behavior and monitored-stream progress semantics.

At the transition to live, reconcile the reader's last delivered position with the retained published range under the same synchronization that controls publication and reclamation.
Register the live cursor before releasing that protection.
If the required suffix is no longer retained, continue catch-up to a newer boundary without claiming a live retention slot for missing data.
Do not hold a buffer or runtime lock across journal I/O.
Prove no gaps, duplicates, missed wakeups, or immediate eviction loop when publication races the handoff.

### Live Delivery And Eviction

Serve published entries directly from shared memory without polling the file archive for each live event or idle wakeup.
Advance retention cursors at a precisely documented handoff point.
A server cursor measures delivery to the next layer, not client receipt or application processing.
Bound and cancel downstream transport buffering so handed-off payloads cannot escape resource accounting indefinitely.

Choose the smallest existing close/error scope that reliably causes the client to reconnect rather than interpret eviction as normal archive completion.
Verify retryable error classification across local sessions, native clients, generated bindings, WebTransport, WebSocket, and the Fluid driver where affected.
Detach retention claims promptly, then complete membership and transport cleanup without duplicating leave events.
Handle several subscriptions on one session explicitly; cancelling one reader must not leave hidden retention claims.

Catch-up sessions still obey writer-reference validation if they attempt to submit stale operations.
Clients remain responsible for reconnect and snapshot choices.
Add client code only where end-to-end evidence shows that existing recovery does not handle the chosen eviction indication.

## Implementation Sequence

### 1. Establish Floor And Progress Contracts

Add focused tests around the sequencer's acceptance point, floor computation, and announcement ordering.
Implement independent enforcement and announcement state while retaining committed recovery state.
Select compatible count/byte lag limits and total-capacity accounting; prove the full-buffer eviction case with a small deterministic fixture.
Verify an existing legal announcement carrier before assuming the protocol can remain unchanged.

Exit condition: enforcement can advance without queue insertion, accepted work remains correctly ordered, and recovery never weakens a committed floor.

### 2. Extend The Shared Pipeline

Add published retention and reader cursors to the existing pipeline owner.
Include the idle path and every membership/control publication path.
Preserve cancellation, batch ordering, backend publication barriers, and bounded lifecycle cleanup.
Validate first with a controlled backend that can pause append settlement and report read calls.

Exit condition: accounting stays bounded through acceptance, publication, fan-out, cancellation, and reclamation, with no visibility before backend publication.

### 3. Connect Readers And Lag Eviction

Implement journal catch-up followed by atomic live registration.
Use the shared buffer for live delivery, and detach lagging readers using enforcement-floor comparisons.
Preserve finite archive reads and monitored-stream status transitions.
Exercise no-reader, one-reader, several-reader, and stalled-reader cases before involving network transports.

Exit condition: live delivery requires no per-event archive reads and remains ordered and complete across handoff races.

### 4. Prove Reconnect Across Client Boundaries

Wire the lag termination through existing error and lifecycle mechanisms.
Force a reader to lag, verify prompt release of its retained data, reconnect, and compare the resulting event sequence with the committed history.
Run the Fluid driver case with pending local operations and with both retained-state catch-up and a newer valid snapshot.
Check retry classification, pending-operation resubmission, audience cleanup, and continued editing.

Exit condition: clients recover without missing or duplicating operations, and reconnect does not depend on new server snapshot-selection policy.

### 5. Measure And Document

Run a short paired comparison against the pre-change baseline using the existing 32-document writer-and-observer workload at a known sustainable rate.
Keep backend, payload size, worker budget, affinity, warmup, measurement duration, and drain checks matched.
Measure CPU, latency, throughput, archive-read activity, retained bytes, and writer wait time.
Include a bounded slow-reader scenario separately from the steady-state throughput comparison.
Retain failures and incomplete drains; do not turn this into an open-ended maximum-capacity campaign.

Exit condition: evidence shows that live journal reads are removed without violating resource, ordering, durability, or reconnect guarantees.
Report the measured CPU effect without promising the earlier diagnostic's speedup.

## Validation Matrix

| Boundary | Required focused evidence |
| --- | --- |
| Floors | Equality accepted; stale references rejected; monotonic enforcement; debounced announcements; accepted old-reference events ordered before newer announcements |
| Capacity | Count and byte limits; oversized input; variable payloads; bounded waiting admissions; capacity wakeups; small-buffer lag policy makes progress |
| Publication | Delayed durable append remains invisible; buffered acknowledgment unchanged; control events included; cancellation retains accepted work |
| Reclamation | No readers; fastest and slowest readers; dropped streams; multiple subscriptions; full-buffer eviction without enqueueing; downstream-held payload accounting |
| Handoff | Concurrent append and reclamation; empty tail; restart with empty live buffer; finite reads; coherent progress; no missed wakeups, gaps, or duplicates |
| Recovery | Runtime-only floor lost on restart; committed floor retained; pending announcement cancellation; checkpoint replay; uncertain append fail-stop |
| Clients | Retryable lag termination; real reconnect and catch-up; pending writes; newer snapshot; continued editing; no repeated immediate eviction |
| Performance | No archive polls for steady-state live delivery; bounded memory with a stalled reader; matched drain-complete CPU and latency comparison |

Place deterministic tests in the owning sequencer modules first.
Use storage conformance tests only for guarantees shared by backend implementations and integration/browser tests for distinct transport and client responsibilities.
Prefer existing fixtures and test files over a new test harness.

Before completing implementation, run the canonical format, strict Clippy, rustdoc, build, test, and documentation commands in [Development](DEVELOPMENT.md), plus its complete `./test.sh` suite for generated-client and browser coverage.
Run `pnpm policy-check --path rust-service` and `pnpm build:fast` from the repository root when implementation changes affect Rust/WASM or registered package inputs.
Regenerate affected bindings and API reports through their build tasks rather than editing generated artifacts.

Update the sequencer, storage, transport, and driver documentation only where their relied-upon contracts change.
Record the accepted shared semantic decision under [historical decisions](historical/decisions/README.md) and add an appropriate changeset when implementing the behavior change.
This plan alone does not change runtime behavior or require a changeset.

## Completion Criteria

- One bounded sequencer buffer carries admitted work through publication and live delivery, with explicit accounting for backend and downstream ownership.
- Live file-backed readers avoid journal reads, while historical reads retain their existing filesystem isolation and semantics.
- One enforcement floor governs stale-reference rejection and lagging live-reader disconnection; delayed announcements remain safe cleanup guarantees.
- Full-buffer eviction makes progress without requiring an outbound update, and remaining pressure backpressures writer admission.
- Existing client catch-up and snapshot mechanisms recover from lag eviction, with any necessary compatibility changes documented and tested.
- Focused regressions, canonical gates, and a bounded matched performance comparison are recorded before the implementation is declared complete.