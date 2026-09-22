# Shared Live Event Buffer Plan

Status: Proposed implementation plan; no implementation is included.
Written on 2026-09-22 against `rust-service` at `eb7a806ade5`.
Revised after source, contract, and broadcast-policy review on 2026-09-22.
Reconcile the source locations and contracts below with intervening changes before implementation.

## Objective

Extend the sequencer's bounded admission pipeline with shared published-event retention under one owner and resource budget.
Serve caught-up readers from published entries instead of reading newly written events back from the journal.
Disconnect lagging live readers using the same current minimum-reference threshold used to reject stale writer references.
Let clients reconnect through existing catch-up and snapshot mechanisms.
Backpressure writer admission when either unfinished storage work or outstanding broadcast work reaches its configured limit.
Protect admitted readers under aggregate outbound pressure by slowing writer admission to the sustainable broadcast rate.
Support many readers on quiet documents through resource-based subscriber admission rather than assuming continuous maximum-rate writes.
Separate replaceable admission and reader-protection policy from shared ordering, accounting, and backpressure mechanisms.
Treat reader expiry as an explicit service policy, not proof that the reader rather than the shared network caused a stall.

Separate the current enforcement floor from its ordered outbound announcement.
The server must be able to advance enforcement, disconnect readers, and reclaim eligible buffer entries without first enqueueing a floor update.
Clients use announced minimum-reference positions to release resources, not as a guarantee that a later write will be accepted.
Announcements can already become stale during a round trip, but enforcing an unannounced floor changes the current documented contract.
Document that change explicitly, including the new byte-based lag limit; it is not only an internal optimization.

## Design Choices

Keep live delivery in the sequencer rather than adding a file-only cache.
This gives all backends the same delivery mechanisms and lets readers share the final sequenced event representation.
A storage-only caught-up fast path could avoid idle offloads, but would still read newly published payloads and would not implement shared session lag policy.
Inline filesystem reads remain excluded.

Require one accounting owner, not one physical collection.
Keep the admission queue and cancellation-retained append driver, and add a private deque for published events.
Transfer ownership and charges between stages without building an independent cache, duplicating payloads per reader, or forcing all stages into one entry state machine.
Preserve the idle fast path, but route its result through the same publication and accounting operation as batches and membership events.

Separate physical memory reserves from permission to admit more work.
Reserves guarantee space for already accepted work to settle and for bounded lifecycle execution; lifecycle dispatch still requires delivery credit and may wait indefinitely under reader protection.
They do not authorize unlimited admission while readers fall behind.
Admission requires both unfinished-work capacity and broadcast credit for the resulting fan-out.
The default protects all admitted live readers by allowing their bounded delivery backlog to backpressure writers.
An explicit expiry policy can eventually detach a reader; aggregate pressure alone is not the default eviction trigger.
Hard resource ceilings always apply, while replaceable policy decides whether to admit a subscriber or continue protecting one.
Do not assume any reader count can be served at the inbound write rate or that the cause of a blocked send can be identified reliably.

Retain the shared reader/writer enforcement floor as an explicit objective of this plan.
A separate reader-overflow threshold would be simpler and could deliver the I/O improvement without changing writer eligibility.
The shared policy instead gives one document-wide boundary for acceptable lag, at the cost of additional floor-ordering and reconnect requirements.
Do not silently substitute independent reader eviction if the shared policy fails its progress tests; revisit this choice before proceeding.

Use subscription-scoped lag termination.
Evicting a reader releases that reader's claims and fails its stream; it does not itself revoke author authority or close sibling historical reads.
Actual session closure or replacement continues to revoke authority and publish the ordered terminal leave.
Use existing event envelopes for floor announcements and existing retryable wire error classifications where sufficient.
Do not add a floor timer, dedicated announcement queue, or new event kind for this optimization.

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
   At review, its only production uses are its declaration, default, validation, and startup logging; it does not enforce eviction.
   Replace this misleading transport setting with sequencer-owned policy and explicit host configuration, handling any public API removal through the normal compatibility process.
- [The Fluid session client](packages/sea-driver/src/sessionClient.ts) has a reconnect hook that waits for disposal before a subsequent open obtains a fresh session.
   Its subscription converts normal completion into an error, and [delta delivery](packages/sea-driver/src/delta.ts) emits a disconnect on subscription failure.
   This supports reuse, but does not prove recovery of pending operations after lag eviction.
- File opening failures currently wake archive readers and terminate their observations.
   Removing live archive reads must preserve that notification, including buffered write-behind failure after successful acknowledgment.

## Scope

Keep the buffer and floor enforcement in the sequencer, where ordering, membership, and reference validation are owned.
Define the application-neutral policy trait and its implementations in the `sea-core` broadcast-policy module described below; do not add a separate crate or general plugin framework.
Let host integration supply resource observations and transport progress without moving transport scheduling into the policy.
Use the same selected policy and delivery semantics with memory, buffered-file, and durable-file storage.
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
9. Cancellation after dispatch does not discard backend work or release its charge before settlement.
   Cancellation after queue admission revokes author authority; undispatched work is released only when definitively rejected under the existing failed-prefix rules.
   Uncertain append outcomes preserve the existing fail-stop and recovery behavior.
10. Catch-up and finite historical reads are not subject to live-reader lag eviction before a successful live handoff.
11. Backend invalidation wakes live readers and capacity waiters even when no further submission occurs.
   Once invalidation is observed, the runtime stops live publication and fails affected streams rather than serving its retained suffix as healthy history.
12. An actively polled live read can drive retained sequencing work through successful publication after the last submitter cancels.
   Delivery must not require another submission, capacity waiter, lifecycle operation, or archive poll.
13. Broadcast credit covers admitted but unpublished work as well as published events awaiting delivery.
   Once admission is backpressured, the remaining accepted prefix must fit without pushing protected readers below enforcement.
14. Outstanding delivery to every protected reader backpressures writers, independently of the suspected cause of delay.
   Policy may terminate a subscription explicitly, but cannot silently exclude it from delivery obligations while leaving it live.
15. Policy approval never overrides hard resource limits or substitutes for atomic reservation.
   Outlier exclusion may influence admission decisions, but never removes a reader's actual resource charges.

## Replaceable Broadcast Policy

Separate decisions about subscriber admission and continued reader protection from the mechanisms that enforce them.
The policy observes bounded resource and progress state and returns decisions; it does not own event payloads, transport handles, locks, or persistence work.

| Shared mechanism | Replaceable policy |
| --- | --- |
| Account physical memory, logical outbound work, memberships, and subscriptions | Admit, defer, or reject a new subscription within available resources |
| Atomically reserve capacity and return it exactly once | Pause and resume admissions based on sustained pressure |
| Track handoff and send-completion progress | Continue protecting a reader or request subscription termination |
| Enforce configured delivery windows and the shared monotonic floor | Choose stall tolerance and which observations influence admission |
| Perform termination, wakeups, timer scheduling, and transport cancellation | Request a bounded future reevaluation deadline |

Use synchronous, bounded policy methods with explicit monotonic timestamps and bounded policy-owned state.
Pass observations such as resource headroom, pending delivery count/bytes, progress age, and time waiting for host scheduling; do not present inferred labels such as unhealthy reader as facts.
The owner applies decisions to current state and rechecks hard limits under the reservation synchronization.
Specify evaluation triggers for joins, progress, pressure transitions, removal, and requested deadlines so deferred admission and expiry do not depend on new writes.
Use owner-scheduled wakeups for deadlines without adding a per-document fan-out task or policy-owned asynchronous loop.
Keep evaluation incremental or amortized; do not scan or allocate a snapshot of every idle reader on every event.
Require compatible native and WASM behavior and avoid callbacks that reenter the owner or perform I/O.

A protected reader is an admitted live subscription whose outstanding delivery obligations still constrain writer admission.
Policy can end that protection only by requesting the existing terminal subscription path, which releases claims and credit exactly once.
It cannot advance the floor arbitrarily, rewrite prepared events, change backend acknowledgment guarantees, or revoke author authority as a side effect.
The count/byte windows are validated construction-time configuration; the shared owner computes the resulting reader/writer floor.
Dropping events, switching a live reader back to archive replay, and replacing history with a snapshot require separate mechanisms and contracts and are outside this trait's initial scope.

Select the policy and its configuration when constructing the service or document owner, with explicit ownership of host-wide versus per-document state.
Runtime hot-swapping and migration of policy state are out of scope.
Implement Sea's resource-aware default and one simple alternative for tests or benchmarks to demonstrate the boundary without duplicating accounting.
Fixed-limit, protect-all-without-policy-expiry, and aggressive-expiry policies are useful benchmark choices, not a requirement to ship a broad production policy catalog.
All choices retain the same hard budgets and actual transport failure handling; indefinite protection can stop writers and leave close completion pending indefinitely.

### Module Organization

Add a public `broadcast_policy` module to `sea-core` with this layout:

```text
crates/sea-core/src/broadcast_policy/
   mod.rs
   resource_aware.rs
   fixed.rs
```

Place the policy trait, shared observation and decision types, and their contracts in `mod.rs`.
Keep each implementation and its implementation-specific configuration in its own file: the resource-aware default in `resource_aware.rs` and the simple fixed-limit alternative in `fixed.rs`.
Keep implementation modules private and re-export their public types from `mod.rs`, so consumers use `sea_core::broadcast_policy` without depending on the internal file layout.
Place deterministic unit tests beside each implementation; keep scripted fault-injection policies in the owning test fixtures.

The sequencer and host depend on this core contract, never the reverse.
Keep policy inputs independent of sequencer internals, transport libraries, and executor-specific timers.
Accounting, reservation, scheduling, persistence, and termination remain in their existing owners outside this module.

### Default Resource-Aware Admission

Use a generous configurable hard subscriber ceiling together with actual resource budgets and a pressure-based admission pause.
Do not initially implement a continuously drifting numerical subscriber limit or reserve peak write-rate bandwidth for every idle connection.
Charge each connection's metadata, bounded transport buffers, and control traffic even when its document has no application writes.
Allocate payload and broadcast-work reservations when work exists, subject to the maximum-event-plus-control-headroom feasibility constraint below.
With no pending delivery, do not infer reader failure from the time since its last event or count idle readers as evidence of good delivery performance.

For admission pressure, start with the fraction of readers with pending delivery whose delivery windows have sustained high occupancy.
Use separate pause/resume thresholds and a sustained observation interval to avoid oscillation; fix numerical defaults and small-sample behavior in step 0.
Apply the gate at both document and host scope without letting many idle documents dilute pressure on a busy document.
An isolated outlier need not pause admission on this aggregate signal, but its bytes and slot still count and its protected delivery still backpressures writers.
Hard limits can block admission regardless of that signal.
Resuming admission does not guarantee a slot: the owner still performs the atomic handoff reservation.

Pressure pauses new admissions; it does not evict existing readers to meet a lower target count.
A quiet document may admit many readers and later become busy; lower write throughput is then an intentional consequence of protecting the admitted group.
Bound concurrent catch-up readers and their outbound share separately, including before live registration, and bound or reject deferred joins rather than queueing unlimited connections.
Catching a moving tail requires delivery faster than ongoing publication, a temporary reduction in writes, or a client-selected newer snapshot.

### Observability And Expiry

The current send abstraction exposes completion, backpressure, and connection loss, not a reliable distinction between a stopped client and a shared outbound bottleneck.
Transport completion does not establish application consumption, and fair host scheduling does not establish that the network supplied service.
Additional transport statistics may help diagnosis but must not be a prerequisite for correct accounting or safe backpressure.

Default expiry uses an explicit configurable no-progress tolerance for pending delivery, excluding the host's own known scheduling wait where measurable.
It does not expire a subscription merely because its document is idle or its window is full while delivery continues.
Even after excluding scheduler wait, an expiry can remove a functioning reader delayed by network congestion.
Document this tradeoff and distinguish policy expiry, resource admission rejection, lag-floor termination, and actual transport failure in diagnostics.
Reconcile existing transport operation deadlines with this tolerance so a shorter hidden timeout does not defeat the selected policy.
Specify the supported frame sizes, fan-out, service rates, and tolerated pauses for no-disconnect acceptance tests; do not claim protection under arbitrary network delay.

## Buffer Ownership And Accounting

Evolve the existing pipeline owner rather than adding a separately managed live cache.
Keep distinct accounting for waiting inputs, admitted or in-flight work, and the published deque.
Track the publication boundary, oldest retained entry, and each live reader's next required entry.
Positions become available from the backend append result; do not fabricate journal offsets for queued submissions.

Retain the final committed representation needed by readers, including resolved session metadata and floor announcements.
An original `EventSubmission` alone is insufficient.
Use a canonical `SessionCommittedEvent` with shared immutable payload bytes for published delivery.
Build its metadata from the prepared event and append result; do not decode and copy the persisted envelope again for each subscriber.
Reuse immutable payload allocations where practical and charge transient input-to-output overlap conservatively.
Keep separate accounting for unfinished work and published retention within one total budget.
Persistence completion releases unfinished-work charges, but not outstanding broadcast credit or reader-owned data.
Backend framing and write-behind remain separately bounded storage ownership, not an unmeasured part of the sequencer's budget.

Published entries can be reclaimed once no live reader or accounted downstream handoff needs them.
The minimum-reference floor is an eviction threshold, not a requirement to retain all entries at or above it.
With no live readers, settled entries need not remain in the sequencer buffer.
Buffered storage must retain any bytes it still needs for write-behind under its own existing bounded ownership.

Reject an individually oversized input deterministically rather than waiting for impossible capacity.
Bound waiting admissions as well as accepted entries; transport handlers must not accumulate unlimited uncharged payloads while waiting.
Wake waiting writers when readers advance, readers detach, entries settle, or the runtime terminates.

### Capacity Policy And Publication Headroom

Start with the existing maximum of 256 unfinished application entries and 4 MiB of charged application input per document.
Use a published lag allowance of 1024 events and an initial byte allowance of the larger of 4 MiB or the combined maximum canonical charges of one legal application event and the mandatory control headroom, whichever limit is reached first.
The count allowance avoids an incidental fourfold reduction solely to match admission capacity; the byte allowance is a new policy to validate with variable-sized workloads.
These are initial policy choices, not a claim that 4 MiB bounds total sequencer memory.
Apply size limits to membership metadata as well as application submissions, and enforce both local and transport entry points.

Reserve capacity before accepting work for its largest simultaneous allocation footprint and for transferring the complete successful batch to published retention.
Use the following conservative budget model, with all terms measured in charged bytes and checked for arithmetic overflow:

| Term | Required bound |
| --- | --- |
| `waiting_bytes` | At most 4 MiB across at most 256 waiting submissions, charged before waiting for per-membership admission order |
| `work_peak_bytes` | All queued and in-flight inputs plus their simultaneous sequencer-owned encoding and metadata allocations |
| `retained_bytes` | The configured published-byte allowance, at least 4 MiB and large enough for one maximum-size legal application event plus mandatory control headroom, after eviction and reclamation complete |
| `publication_slack_bytes` | Maximum canonical output charge of one complete application batch or one membership event, whichever is larger |
| `lifecycle_bytes` | Physical work space for one bounded control publication and its transient encoding, unavailable to application admission; reuse still requires broadcast credit |

The configured sequencer budget must cover the sum of these terms.
Similarly, reserve entry and metadata capacity for 256 unfinished entries, 1024 settled retained entries, one complete publication batch, and bounded lifecycle work.
Unused reserves need not allocate payload memory eagerly.
This deliberately conservative partition is the initial implementation; do not introduce dynamic borrowing between reserves until evidence justifies the complexity.
Compute the numerical peak and per-entry overhead from the chosen representations in step 0, including `Bytes` allocation sharing and any retained backing allocation larger than its visible slice.
Do not accept an input that fits the input limit but cannot fit its encoded or published representation or the configured transport frame limit.

After a batch settles, install its published prefix, advance enforcement within the admission-protected bounds, detach eligible lagging readers, and reclaim entries before admitting another publication.
Publication slack covers allocation overlap while accepted work settles, even if every reader is stopped; it is not permission to overrun their delivery windows.
For a reader exactly at the new floor, only the suffix strictly after that floor requires retention; equality remains valid.
The byte allowance must fit one maximum-size legal application event plus mandatory control headroom so a reader at the preceding tail is not evicted solely because that event and a required control event are large.
Require each publication batch to fit the count/byte delivery allowance, and reserve credit for the entire outstanding admitted prefix, not only the current batch.
Batch preparation must not group work beyond the reserved delivery window.
Include reserved control-event headroom in this calculation so lifecycle publication cannot unexpectedly evict otherwise protected readers.
Mandatory control headroom covers one maximum-size legal control event in each protected reader's count/byte window and its fan-out-weighted contribution to document/host broadcast budgets.
Application admission must leave that headroom available after accounting for all outstanding obligations; it cannot reuse credit occupied by a settled but undelivered control event.
This is bounded headroom for a control publication, not a reservation for every membership's eventual leave.
Do not silently discard a backend-acknowledged event or change acknowledgment semantics to avoid that case.

Reader retention cannot consume the physical capacity reserved for settling accepted work.
A small retained suffix can nevertheless delay admission of a maximum-size legal input until enough broadcast credit is returned.
That is intentional backpressure, not deadlock: delivery, cancellation, invalidation, and eligible reader detachment must remain runnable while admission waits.
The maximum legal application's resulting event plus mandatory control headroom must fit the per-reader count/byte window and the document/host broadcast budgets when empty, multiplied by the admitted fan-out where applicable.
Validate that relationship at configuration and subscription admission; reject an incompatible reader-count increase rather than letting an otherwise legal write wait for impossible credit.
This is a logical event-plus-control feasibility bound, not eager payload allocation or a reservation of continuous maximum-rate bandwidth.
It still limits idle fan-out for a fixed maximum event size and outbound-work budget; expose that effective ceiling when choosing defaults for quiet documents.
Excess waiting callers receive a definitive pre-admission capacity outcome; ordinary accepted-capacity pressure waits.
Preserve failed-prefix ordering when rejecting excess requests from an already active author stream.
Bound payload receipt at the host before decoding or queuing additional submissions; caller-owned unpolled futures cannot be bounded by the sequencer.

Maintain explicit host limits on memberships and subscriptions, including unannounced memberships.
Reserve membership capacity until its required leave settles so pending cleanup cannot grow behind a fixed active-membership limit.
Account separately for one response and its serialization buffers per active transport stream, transport-library buffers, and backend write buffers.
The sequencer budget is not a total-process resident-memory bound.

### Broadcast Admission And Adjustable Fan-Out

Maintain a bounded delivery window per protected live subscription, plus aggregate host and per-document outbound-work budgets.
For each admitted event, reserve its future count and byte contribution before dispatch, including conservative wire framing and the number of protected network subscribers.
The shared canonical payload is charged once as memory, while broadcasting it to 100 readers creates approximately 100 payloads' worth of outbound work.
Logical outbound-work charges are not 100 eagerly allocated payload copies.
Use checked arithmetic and account for the actual selected transport representation; release excess reservation after encoding if appropriate.
With no live readers, no live broadcast credit is needed, but storage admission remains bounded.

Default to protecting every admitted live subscription until explicit termination, rather than a fastest-reader or majority watermark that can silently discard delivery obligations.
Admission waits when any protected reader's remaining window or the aggregate broadcast budget cannot cover another event.
Keep enough events and bytes in flight to fill the available bandwidth; do not serialize each append behind all of its network sends or change a successful append receipt into a delivery acknowledgment.
Once accepted, an event settles under its backend's existing acknowledgment contract independently of delivery.
Storage and broadcast limits jointly constrain the sustained accepted rate.

Track delivery completion separately from returning a payload from the sequencer stream.
The network adapter returns broadcast credit when its bounded send stage has accepted the complete frame, not when it fetches the event for serialization.
Bound transport-library and socket buffering as well, so write completion cannot hide an unbounded backlog beyond this stage.
This observes transport service, not client application processing, and requires no new client acknowledgment protocol.
Verify what WebTransport and WebSocket write completion actually guarantees before choosing the credit-release point.
If a transport cannot provide sufficiently bounded backpressure, add an explicit bounded adapter rather than treating its enqueue operation as delivery.
For local consumers, returning an item is the service boundary; arbitrary retention or processing after return remains caller-owned.

New subscriptions require policy approval and must reserve their slot, retained suffix, and delivery credit atomically at live handoff, accounting for previously admitted but unpublished events that they will observe.
Delay live handoff or reject excess subscription admission if that reservation cannot fit; do not invalidate reservations for already accepted work.
Reader removal releases its outstanding credit exactly once and wakes writers.
Cancellation after append dispatch retains the event's broadcast obligation for remaining readers even when its submitter disappears.

Expose validated hard limits for memberships and live subscriptions, per-reader event/byte windows, and host/document outstanding broadcast bytes separately from policy configuration for admission pressure and reader expiry.
Allow an optional host egress-rate budget when the deployment must share its link with other traffic; bounded send backpressure remains required even with a configured rate.
Use fair scheduling across connections and documents, and give catch-up traffic a bounded share of the same outbound resources.
Do not let a reconnect storm consume all live-delivery capacity or let lifecycle traffic become an unbounded bypass.
Reserve bounded control headroom within the host budget; completing all pending controls still depends on returning delivery credit as described below.
Choose explicit defaults in step 0; the default pressure pause does not imply a drifting subscriber limit, quorum eviction, or a minimum per-document write-rate guarantee.

A reader that makes slow but continuing progress can constrain the document's write rate under the default all-reader policy.
Reader-count admission limits and outbound allocations make that tradeoff adjustable; accepting another reader is not a promise to preserve the previous write rate.
Use the selected expiry policy and actual transport/session failures as escape paths independent of the event-position floor.
Otherwise all stopped readers can pin admission below the lag threshold forever; a protect-all policy deliberately accepts that possibility.
Expiry is a service decision under incomplete information, not a diagnosis of an individual fault.
Test deadlines against configured maximum frames and the stated service assumptions, including host scheduling delay and shared congestion.
An aggregate outage may stop accepted throughput and lifecycle completion; no finite buffer can guarantee delivery to disconnected peers or positive writer throughput when outbound capacity is zero.

## Enforcement And Announcement Floors

### Enforcement

Maintain a current enforcement floor independently of outbound queue insertion.
Advance it monotonically using already published, valid reference positions and an explicit lag policy.
Use it for stale-reference rejection and lagging live-reader disconnection.
Do not derive the new floor from uncommitted positions or cap it at a stale writer's proposed reference.

Use a bounded deque of recent published positions and canonical charges to compute the earliest valid boundary whose following suffix satisfies both lag allowances.
Keep this small metadata window even when there are no payload-retaining readers; enforcement must not depend on whether payloads were reclaimed.
Advance to the maximum of that boundary and the existing enforcement floor after every publication.
Include all committed event kinds.
Membership positions are already referenceable in the current sequencer and storage resolver; do not round only to application-submission positions.
The same resulting floor governs readers and writers; do not introduce a separate reader-only eviction threshold.

Do not use the current cooperative minimum over writer references to evict readers.
A writer's submission reference is not evidence that another subscription, or even its own subscription, has received that event.
For this design, the published count/byte window is the enforcement advancement policy; preserve the recovered floor as its lower bound.
Broadcast admission must prevent publication from advancing this boundary beyond protected readers' completed delivery positions, including the entire already accepted prefix and control headroom.
Keep both the sequencer handoff cursor and the completed-delivery position where the transport can hold a handed-off event.
Do not compare enforcement only against the handoff cursor and call queued network bytes delivered.
Lag eviction remains valid for readers outside their permitted window, but protected readers must not reach that state solely because storage outpaces aggregate broadcasting.
Policy expiry uses explicit subscription termination rather than inventing a new floor or a separate reader-only position threshold.
Removing cooperative advancement may delay client cleanup on lightly loaded documents and must be documented and tested.
Remove the 64-entry enforcement debounce; batch publication already groups updates without preventing progress.
Recovery starts the recent-position window empty, retaining the committed floor but not inventing byte charges for unreplayed history.

### Ordered Announcements

Track enforcement, the floor frozen into the current prepared batch, and the committed/checkpointed floor separately.
With one sequential persistence driver, the prepared batch boundary provides announcement ordering; do not add an independently scheduled notification mechanism.
Validate a batch against the current enforcement floor, then carry that frozen floor on its events.
Previously prepared work stays ahead of later batches and lifecycle events.
Advance enforcement from newly published results only after applying that batch's committed metadata; the next prepared batch can announce the newer floor.
Membership events use the same preparation and publication rules, with their reference set to the preceding applied position.
Do not modify prepared events or advance announcement tracking when preparation fails.
An idle document needs no announcement until another ordered event exists.

Distinguish a submission waiting for capacity, a queue-admitted input, and an accepted/prepared ordered event.
Document the exact validation and ordering point.
Inputs not yet accepted for sequencing may be validated against newer enforcement.
Already accepted events must remain ahead of an announcement that would invalidate their references; do not silently reinterpret acceptance.
Lifecycle events and batches must obey the same rule, including events admitted before an enforcement advance but persisted afterward.
Queue admission transfers cancellation ownership, not a guarantee of successful reference validation or commitment.
Preserve the existing rule that cancellation after admission revokes authority, undispatched successors may be rejected, and already dispatched work retains its charge until settlement.
Do not reinterpret the retained-work invariant as requiring every queued input to commit.

Enqueued is not durable.
Retain the existing committed/checkpointed floor as recovery state, separate from these runtime observations.
On restart, initialize enforcement and announcement tracking from recovered committed history, not from lost runtime-only advances.
This may discard an unannounced enforcement advance, but must never roll back a committed cleanup guarantee.
Test checkpoint replay and uncertain append recovery before claiming compatibility without a format change.

## Backpressure And Progress

When admission reaches either storage-work or broadcast capacity, stop admitting further work and drive settlement and delivery using their existing reservations.
Apply the current lag policy, detach already eligible live readers, and reclaim published entries whose retention claims are gone.
Do not advance enforcement past protected delivery positions merely to admit more writes or release broadcast credit.
These operations update runtime state directly and must not enqueue a leave or floor event before releasing capacity.
Any required ordered membership event follows through a bounded lifecycle path that preserves event order and has physical work capacity independent of the full application queue.
Its dispatch can still wait for broadcast credit; physical reserves do not guarantee completion of all pending closes.
Account for pending cleanup work; moving it to an unbounded side queue is not a solution.
Subscription eviction alone creates no leave event.
For real session closure, revoke authority and mark cleanup once on the bounded membership record without waiting for delivery credit.
Detach any subscriptions actually ended by that closure before waiting, without terminating an independent protected observer to make cleanup progress.
Serialize the required leave after previously accepted work settles, reserving its count, bytes, and actual protected-reader fan-out before dispatch.
Do not keep admission or runtime locks, or any lifecycle gate needed by reader progress, detachment, or invalidation, while waiting for a reader, a send, or lifecycle capacity.

### Lifecycle Delivery Credit

Choose delivery-backpressured close completion rather than reserving every future leave obligation when admitting a membership.
Each dispatched leave consumes broadcast credit under the same rules as other ordered events.
Backend settlement frees its physical work reserve but does not return that delivery credit; only the defined delivery boundary or reader detachment does.
Once accumulated leaves and other outstanding events exhaust the delivery allowance, subsequent leaves remain pending on their bounded membership records until credit returns.
Give pending cleanup priority over fresh application reservations when credit returns, preserving already accepted event order and fair service among pending closes.
Retain those memberships against the membership cap until their required leaves settle, and preserve pending cleanup if a close caller cancels.
Pending cleanup is not permission to publish without credit or silently omit a required leave.

Close succeeds only after its required leave has settled under the backend contract, not merely after authority revocation or recording pending cleanup.
It need not wait for delivery of that leave once dispatched, but obtaining dispatch credit can delay close completion indefinitely under indefinite reader protection.
Session replacement or graceful shutdown that waits for these closes inherits that delay; timeout or cancellation must not be reported as successful ordered closure.
Delivery, explicit reader detachment, policy expiry when enabled, and backend invalidation remain runnable and wake lifecycle credit waiters.
Do not replenish the mandatory control headroom merely because a control append settled, or advance enforcement past protected readers to unblock cleanup.

Add a deterministic regression with several announced writers and an independent live observer whose earlier join events have been delivered.
Disable policy expiry, stop the observer's delivery, and fill the application portion of a small window so only mandatory control headroom remains.
Close several writers and drive backend settlement: the reserved leave can settle, but later leaves must wait without exceeding count, byte, or aggregate fan-out budgets.
Verify prompt authority revocation, retained bounded cleanup records, and no observer eviction even after the first leave's physical reserve is freed.
Then resume the observer and require every pending close to finish with exactly one correctly ordered leave; separately verify observer detachment unblocks cleanup and cancellation of a waiting close does not lose its leave.

Extend these fixtures with concurrent close calls through cloned handles: both await the same pending leave, neither reports success before settlement, and cancelling one caller neither cancels cleanup nor causes duplicate publication.
Also attempt live handoff of a late subscriber while cleanup is pending.
Verify that handoff extends reservations for already admitted leave events it will observe, and subsequent leave dispatch includes that subscriber's count, bytes, and fan-out charges.
Insufficient credit must defer handoff or dispatch without bypassing accounting; once readers progress, pending cleanup must complete with exactly one delivery of each applicable leave to the late subscriber.

Change lifecycle barriers to drain unfinished sequencing work, not published retention.
Reader progress and detachment use short synchronous state transitions and never require the lifecycle gate or a runtime mutex held across backend I/O.
Keep cancellation-retained shared persistence work and the native/WASM execution model, but extend its driving callers to include live reads.
Retaining the current driver unchanged is insufficient: backend completion may occur independently while applying its result still requires polling that driver.
Do not introduce a per-document background task solely for live fan-out.
When publication has evicted a reader, capacity waiters can drive remaining accepted work without waiting for that reader's task to poll again.

### Reader-Driven Settlement

Before a live read returns pending, it must register for work installation as well as published-data, invalidation, and termination notifications, and poll available shared sequencing work.
Cover queue admission, installation of an idle-path retained append, and retained lifecycle publication; none may rely solely on a cancelled caller's waker.
Make registration and the subsequent work/data check race-safe so installing work just before or during registration cannot leave a reader asleep.
Polling the shared driver must register the live task for backend-completion wakeups, including when completion races the first reader poll.
When one batch finishes, recheck queued work and publication state before sleeping.

Readers must cooperate on the same owned future, never start duplicate appends or apply one result twice.
Dropping a reader's temporary driving future must leave accepted work retained and let another reader or existing driving caller continue it.
Do not hold publication, cursor, or driver-slot locks while polling backend work, and do not acquire a lifecycle barrier that drains the work being driven.
Preserve bounded cooperative turns so driving a backlog does not starve event delivery, cancellation, or other readers.
Use bounded per-subscription wake registrations; one shared waker slot must not let a stopped reader replace all active readers' notifications.

The guarantee requires a consumer whose pending read continues to be scheduled by its executor.
If all reads are unpolled or blocked downstream and no other driving operation remains, no autonomous settlement is promised; the next live poll or existing driving operation must resume the retained work.
This preserves the no-background-task model without making an actively waiting observer depend on unrelated traffic.
Backend invalidation is a separate failure path and cannot substitute for successful-settlement wakeups.

Add a deterministic regression in the existing sequencer fault fixtures: register an independent observer at the live tail, poll its read to pending, dispatch a blocked append, cancel its only submitter, and release the backend.
Drive only that observer and the controlled backend afterward, and require exactly one delivery of the committed event with no additional archive reads.
Do not call submit, close, shutdown, or a state-query helper that drives settlement to make the assertion pass.
Cover idle-path and batched work, installation/registration races, and dropping one of several driving readers while another remains active.

If remaining capacity is occupied by accepted but unpublished work, wait for backend settlement.
Reader progress releases published retention and returns broadcast credit without disconnection.
It can therefore unblock writer admission, although it does not expand the separate physical unfinished-work reserve.
Keep pressure distinct from backend failure and from an invalid writer reference.
Use deterministic scheduling tests to prove that, when the selected policy requests termination, a stopped reader cannot prevent the transition that makes its retained entries reclaimable.
For indefinite protection, prove bounded memory and writer/lifecycle backpressure instead of unconditional reclamation, writer progress, or close completion.

The two-floor split removes the dependency on publishing a notification before eviction.
It does not by itself prove that the lag threshold is reachable, that outstanding sends release payload ownership, or that persistence can progress while admission waits.
Those are separate acceptance requirements.

## Backend Failure Notification

Add a narrow opening-invalidation notification at the storage/view boundary if no existing capability can provide it without archive polling.
It reports a sticky terminal opening failure, not event payloads or a second publication stream.
Memory storage can remain healthy until its documented invalidation boundary; file storage must signal uncertain writes, worker failure, and buffered write-behind failure.
Keep backend-specific poisoning and filesystem scheduling inside storage.

Subscribe without a check-then-register race and retain the terminal state for late subscribers.
Expose a cheap shared failure observation and wake registration so the sequencer's live readers and capacity waiters do not need a monitoring task or periodic `head()` calls.
On observed invalidation, fail closed, wake waiters, detach retention claims, and preserve existing ambiguous-outcome recovery rules.
An already completed delivery cannot be retracted; successful buffered acknowledgment still does not promise persistence.
Do not report invalidation as lag eviction or claim that reconnect can recover acknowledged buffered data that the backend lost.

Prove idle failure delivery with no new appends, failure racing live registration, and failure while a transport send is blocked.
Treat the notification as a shared contract change with backend conformance evidence, even if journal and wire formats remain unchanged.

## Reader Lifecycle

### Catch-Up And Live Handoff

Start behind-tail readers on the existing journal-backed path, optionally after a client-selected snapshot.
Keep historical reads lazy and preserve finite `stop_after` behavior and monitored-stream progress semantics.

At the transition to live, reconcile the reader's last delivered position with the retained published range under the same synchronization that controls publication and reclamation.
Register the live cursor before releasing that protection.
If the required suffix is no longer retained, continue catch-up to a newer boundary without claiming a live retention slot for missing data.
Use a finite captured published boundary for each catch-up attempt, then check the suffix under the publication lock.
An empty archive needs a direct atomic live-registration path rather than a fabricated upper-bound position.
Register only if the delivered cursor is at or above enforcement and the entire missing suffix is available; at the exact published tail, an empty deque is sufficient.
Recheck policy admission and reserve the slot and outstanding delivery obligations at that boundary.
If policy or capacity defers handoff, await a relevant wakeup within the bounded catch-up admission budget rather than repeatedly opening archive readers or spinning at the tail.
Cancel and drop the archive source after successful handoff so it no longer retains file-reader wakeups or ownership unnecessarily.
Do not hold a buffer or runtime lock across journal I/O.
Prove no gaps, duplicates, missed wakeups, or immediate eviction loop when publication races the handoff.
Yield between failed handoff attempts rather than spinning or reserving space for missing history.
Catch-up progress requires a reader able to approach the publication rate, or an application-selected newer snapshot; this plan cannot guarantee live entry for an indefinitely slower reader.
Test bounded races and recovery at sustainable rates, not an unconditional starvation-freedom claim.

### Live Delivery And Eviction

Serve published entries directly from shared memory without polling the file archive for each live event or idle wakeup.
Advance the sequencer cursor when returning an item to the consumer, transferring its downstream ownership at that point.
A server cursor measures delivery to the next layer, not client receipt or application processing.
Local callers own returned values and may retain them; arbitrary caller retention is outside the sequencer budget.
For server-owned consumers, allow one outstanding response per stream and charge its payload copy and encoded frame to a separate bounded transport budget.
Keep its broadcast credit outstanding until the transport completion boundary, even if the payload no longer occupies the shared deque.
Do not make settlement of an already accepted append wait for client acknowledgment or tie sequencer memory accounting to arbitrary caller-held `Bytes` clones.
Future admission does depend on bounded downstream delivery progress.

Represent lag as a terminal stream error, using the existing `Unavailable` classification if its client mappings prove suitable.
Retain an independent stream-termination signal so the transport can cancel a blocked response write without polling the next event.
When a frame is partially sent, reset or abort the affected stream instead of attempting to append an error frame to partial data.
Release the sequencer claim before attempting network notification; an operation timeout is a fallback, not the eviction mechanism.
Verify retryable error classification across local sessions, native clients, generated bindings, WebTransport, WebSocket, and the Fluid driver where affected.
Detach retention claims promptly, then complete membership and transport cleanup without duplicating leave events.
Handle several subscriptions on one session explicitly; cancelling one reader must not leave hidden retention claims.
An auxiliary reader's eviction must not close sibling finite reads or author authority.
The primary live client's recovery may replace its whole session, at which point normal ordered close applies.
If the current transport cannot isolate that scope, resolve and document the contract change in the first end-to-end test rather than silently broadening eviction.

Catch-up sessions still obey writer-reference validation if they attempt to submit stale operations.
Clients remain responsible for reconnect and snapshot choices.
Add client code only where end-to-end evidence shows that existing recovery does not handle the chosen eviction indication.

## Execution And Progress

Use one sequential implementation owner in the dedicated worktree below, with fresh read-only subagents for checkpoint review.
This is not a multi-workstream iteration and does not require numbered iteration records or an integration branch.
The user authorizes creating this implementation branch/worktree and committing validated, reviewed checkpoints to that branch without asking for approval for each commit.
Do not merge, push, delete the worktree, rewrite committed history, or change the primary checkout as part of implementation without further authorization.

| Item | Fixed location or state |
| --- | --- |
| Implementation branch | `rust-service-live-event-buffer` |
| Implementation worktree | `/workspaces/FluidFramework-live-event-buffer` |
| Working plan | `/workspaces/FluidFramework-live-event-buffer/rust-service/LIVE_EVENT_BUFFER_PLAN.md` |
| Cumulative review report | `/workspaces/FluidFramework-live-event-buffer/rust-service/LIVE_EVENT_BUFFER_IMPLEMENTATION_REPORT.md` |
| Setup state | Planned; branch, worktree, and report not yet created |
| Starting revision | Pending setup; record the exact commit containing the finalized plan before implementation |

At setup, verify that the latest plan, including performance thresholds, is committed in the selected starting revision.
If it is not, stop for the plan to be committed rather than branching from an older version or silently carrying unrelated working-copy changes.
Create the named branch and worktree from that revision without switching the primary checkout.
If either name already exists, inspect its branch, starting revision, and worktree status; resume only if it is the intended implementation, otherwise ask the user rather than resetting or overwriting it.
Update the setup state and starting revision here in the worktree's copy of the plan; that copy is authoritative for in-progress status.
Record baseline validation commands and results, distinguishing pre-existing failures from regressions, and freeze the performance comparison inputs in checkpoint 0.
Keep implementation edits, test artifacts, and report updates in the dedicated worktree and identify its absolute path in status reports.
Verify the worktree path, branch, and revision before running modifying commands.

Keep each checkpoint buildable and include its production changes, focused regression tests, and affected contract documentation together.
Run the narrowest executable check after each substantive edit, then the applicable format, lint, documentation, and affected-package checks before declaring that checkpoint ready to commit.
These checks do not replace the full implementation gates in the validation section.
Keep incomplete delivery paths inactive and preserve existing behavior until the complete-path integration is validated; an intermediate commit must not expose partially enforced accounting or protection guarantees.
If a boundary cannot stand alone safely, record the reason and combine it with its immediate dependency rather than committing a broken intermediate state.
Do not defer all step 2 work into one unexplained implementation commit.

### Pre-Commit Review

After implementing a checkpoint and passing its applicable checks, request an independent review before committing.
Use a fresh read-only subagent invocation with separate conversation context, not a continuation of the implementing agent's reasoning.
Provide the exact worktree, checkpoint scope, fixed checkpoint-start commit, complete changed-file list including staged, unstaged, and untracked files, relevant plan contracts, and validation evidence.
The first checkpoint starts at the recorded setup revision; later checkpoints start at the preceding checkpoint commit.
Keep that comparison base fixed through repairs so the reviewer assesses the complete checkpoint rather than only the latest fix.
Do not prime the initial reviewer with the implementer's conclusions; require concrete findings with severity, file/line evidence, failure mechanism, and a proposed correction, plus any unverified areas.
Cover correctness, contract compatibility, cancellation, lock ordering, resource accounting, tests, and material performance risks as applicable to the checkpoint.

The reviewer must not edit files, commit, stage, or start uncoordinated terminal commands.
Pause implementation edits while it reviews the working tree so the reviewed state is stable.
The implementing agent runs requested reproductions and checks, following the terminal-coordination rules in the Rust service coordination skill; a separate worktree or subagent does not isolate a shared terminal.
If fresh-agent review is unavailable, report the blocker rather than substituting self-review and declaring convergence.

Triage findings against code and contracts, fix actionable issues, and rerun affected checks.
Allow at most two repair-and-review cycles after the initial review, using a fresh reviewer each time to verify fixes and assess the complete updated checkpoint for regressions.
Supply prior findings and their dispositions to verification reviewers, without treating the implementer's disposition as proof.
Convergence means no unresolved actionable correctness or contract findings and passing checkpoint checks, not the absence of every optional improvement suggestion.
Document declined or deferred suggestions with evidence; do not dismiss a finding solely to meet the review limit.
If issues remain after the bounded cycles, a consequential design disagreement persists, or an approved constraint must change, mark the checkpoint blocked and ask the user for guidance before committing or expanding scope.

On convergence, update the report and checkpoint record, then commit only the reviewed checkpoint scope on the implementation branch and continue to the next checkpoint.
Substantive changes after the final review require renewed review and affected validation; report/status-only bookkeeping can be included without restarting the cycle.
Review does not replace executable validation or the full final gates.

### Review Report

Create `rust-service/LIVE_EVENT_BUFFER_IMPLEMENTATION_REPORT.md` in the implementation worktree when checkpoint 0 starts.
Maintain one cumulative report with a section per checkpoint and short subsections for review rounds; do not create a report per subagent invocation or retain raw transcripts as the report.
Record the checkpoint's purpose, starting revision, reviewed scope, reviewer invocation identifier when available, and validation evidence identifying the tested state.
Summarize findings and severity, changes made in response, why those changes improve the implementation, and declined or deferred suggestions with reasons.
Include tests added or rerun, exact commands and outcomes, remaining risks, and final review disposition.
Preserve earlier failed checks and findings so the user can follow how the implementation changed rather than seeing only the final result.
Include the report update in the checkpoint commit; record the resulting commit identifier in the next progress update rather than amending repeatedly to insert its own hash.
Keep detailed benchmark evidence in the existing measurement locations and link it from the report and this plan.

### Checkpoint Record

All implementation checkpoints start as not started; plan review and documentation checks are not implementation evidence.
Update the status and evidence as work proceeds, preserving failed checks and unresolved findings rather than replacing them with a success summary.

| Checkpoint | Commit scope | Acceptance check | Status | Commit | Evidence / blockers |
| --- | --- | --- | --- | --- | --- |
| 0 | Concrete budgets, lock/ownership rules, transport completion findings, and deterministic resource fixtures | Checked event-plus-control and fan-out budgets; lifecycle waiting model; resolved interface and wakeup choices | Not started | None | Not run |
| 1 | Floor computation, frozen announcements, and recovery contracts with tests | Equality, stale-reference rejection, accepted-prefix ordering, and committed-floor recovery pass | Not started | None | Not run |
| 2a | Core policy trait, shared types, resource-aware and fixed implementations, and unit tests | Deterministic admission, hysteresis, idle behavior, and expiry decisions; native/WASM compatibility | Not started | None | Not run |
| 2b | Sequencer publication ownership, credit reservations, lifecycle waiting, and shared-driver wakeups | Controlled-backend tests for whole-prefix bounds, cancellation settlement, concurrent closes, and exact-once credit release | Not started | None | Not run |
| 2c | Local catch-up/live handoff, shared delivery, opening invalidation, and subscription termination | No live archive polls; race-safe handoff including pending leaves; idle failure notification and bounded cleanup | Not started | None | Not run |
| 2d | Host/transport credit completion, fair scheduling, policy integration, and one complete Fluid path | Real blocked-send termination, bounded broadcast pressure, pending-operation recovery, and continued editing | Not started | None | Not run |
| 3 | Early matched performance evidence and any separately identified local repairs | Sustainable baseline and constrained fan-out runs support proceeding; failures and drain results retained | Not started | None | Not run |
| 4 | Remaining backend, transport, generated-client, and recovery coverage with required fixes | Validation-matrix recovery and compatibility cases pass across the required stacks | Not started | None | Not run |
| 5 | Final measurements, contract documentation, accepted decision, and changeset | Complete validation gates and matched measurements recorded; remaining limitations explicit | Not started | None | Not run |

Checkpoint 2d completes step 2's exit condition; do not start broad coverage expansion before step 3's performance decision.
Split step 4 into named stack-specific commits if needed, updating this table before proceeding rather than creating an untracked workstream.
Record actual commit identifiers only after commits exist; capture a checkpoint's identifier in the next progress update rather than amending repeatedly to record its own hash.
For benchmark evidence, identify the measured source revision and any uncommitted changes separately from the later report commit.

### Progress Reporting

Report to the user when a checkpoint starts, reaches its acceptance check, completes a review round, or is committed, and promptly when validation fails, a blocker appears, or a design assumption changes.
During long-running work, give concise interim updates describing the current check or unresolved issue; do not wait for an entire implementation step to finish.
Before pausing or handing off, update this record with the current checkpoint, exact next action, and outstanding risks.

Distinguish not started, in progress, implemented but unverified, focused checks passed, blocked, and full validation passed.
Commit and review status are separate from validation status; a commit or clean review does not establish full acceptance.
For each checkpoint, record the changed scope, exact validation commands and outcomes, evidence paths where applicable, unresolved failures or skipped checks, and next action.
Include the exact implementation worktree and cumulative review-report paths so the user can find in-progress work from the primary checkout.
Use this checkpoint table and the cumulative review report rather than adding another progress-report framework.
Do not mark the implementation complete until all required gates and completion criteria pass, or present an explicitly accepted exception as a passing check.

## Implementation Sequence

### 0. Fix Resource And Lifecycle Boundaries

Turn the capacity table into checked numerical constants and allocation accounting for the actual representations.
Specify membership/subscription caps and overload classification, the opening-invalidation capability, and the independent reader-termination signal.
Specify the broadcast-credit interface between sequencer admission and transport delivery, including local-session behavior, host/document fairness, reservation at live handoff, and cancellation ownership.
Specify delivery-backpressured lifecycle dispatch, prompt authority revocation, pending-close ownership, and the distinction between leave settlement and return of its broadcast credit.
Define mandatory control headroom in counts, canonical bytes, and transport fan-out charges, and document its effect on close, replacement, and graceful shutdown completion.
Specify the synchronous policy trait, observation scope, decision application, reevaluation triggers, and deadline wakeups alongside the concrete resource-aware default.
Separate hard ceilings from policy tuning; define pressure hysteresis, pending-reader sampling, bounded deferred joins, idle behavior, and expiry semantics without requiring congestion diagnosis.
Choose construction-time policy selection and benchmark identification without runtime hot-swapping or new public generic parameters unless needed by an actual caller.
Resolve concrete defaults and the send-completion boundary using the existing transport APIs before implementing the gate.
Specify race-safe work-installation notifications and live-reader participation in the shared driver before treating the existing driver as reusable.
Keep these decisions in this plan until implementation validates them; do not create an accepted historical decision prematurely.
Use existing sequencer fault fixtures to model publication, stopped readers, and small budgets before changing production state ownership.

Prove the budget inequality for a full admitted batch, input-to-output overlap, a maximum-size event after a small retained suffix, control-only traffic, and simultaneous membership cleanup.
Prove that publication of the whole accepted prefix after admission stops cannot overrun protected readers, and that a policy-expired reader can be released without needing another event to advance the floor.
Prove maximum-event-plus-control-headroom feasibility at the configured idle-reader ceiling and disclose the resulting bound; do not claim unlimited idle fan-out from lazy payload allocation.
Model several announced writers closing against a stopped independent reader with expiry disabled, proving bounded waiting after control headroom is consumed and progress after delivery or detachment.
Verify that backend and transport maximum sizes are compatible with all accepted event kinds.
Define which existing tests protect cancellation before admission, after admission, and after dispatch.

Exit condition: limits, policy decisions, and ownership transfers have a deterministic progress model, and no unresolved API choice prevents admission reevaluation, failure notification, or send cancellation.

### 1. Establish Floor And Progress Contracts

Add focused tests around the sequencer's acceptance point, floor computation, and announcement ordering.
Implement published-window enforcement and frozen batch announcements while retaining committed recovery state.
Use the limits and accounting established in step 0; prove full-buffer eviction and floor equality with a small deterministic fixture.
Verify an existing legal announcement carrier before assuming the protocol can remain unchanged.

Exit condition: enforcement can advance without queue insertion, accepted work remains correctly ordered, and recovery never weakens a committed floor.

### 2. Implement One Complete Live Path

Add the published deque and reader cursors to the existing pipeline owner without replacing its admission queue or retained driver.
Include the idle path and every membership/control publication path.
Preserve cancellation, batch ordering, backend publication barriers, and bounded lifecycle cleanup.
Validate first with a controlled backend that can pause append settlement and report read calls.
Implement journal catch-up followed by atomic live registration.
Use the shared buffer for live delivery, and detach lagging readers using enforcement-floor comparisons.
Preserve finite archive reads and monitored-stream status transitions.
Connect opening invalidation and independent send cancellation, including the empty/idle cases.
Prove reader-driven successful settlement after cancellation of the only submitter, without subsequent operations or live archive polls.
Exercise broadcast admission with a controlled shared egress budget and separate reader completion signals before relying on network timing tests.
Implement the multi-writer close regression, including cancellation of a waiting close and both delivery-driven and detachment-driven resumption.
Run the same accounting and ordering fixtures with the default and a simple alternative policy.
Use deterministic time and scripted decisions to test admission pause/resume, idle-reader survival, expiry without new writes, and racing policy approval versus reservation.
Prove that permissive policy decisions and outlier exclusion cannot bypass hard budgets or erase protected delivery obligations.
Exercise no-reader, one-reader, several-reader, and stalled-reader cases locally, then run one real transport/Fluid path with a blocked reader and pending local operations.
Verify terminal leave ordering during replacement and continued editing after catch-up.

Exit condition: the full path demonstrates bounded ownership, backend failure visibility, zero per-event live archive reads, and successful lag recovery before broader rollout.

### 3. Check Performance Before Expanding Coverage

Run a short paired comparison at a known sustainable load against the pre-change baseline as soon as the complete live path works.
Match the configuration described in step 5, and include a memory-backend control and a one-writer/100-reader WebTransport case with explicitly constrained aggregate outbound bandwidth.
Increase offered writes above sustainable egress capacity without running an open-ended capacity search.
Use the default policy and declare a service envelope within its expiry tolerance; require bounded backlog, upstream backpressure, and no lag evictions or reconnects among the admitted readers within that envelope.
Measure link utilization and compare accepted rate with the observed storage and aggregate-broadcast limits; a low offered rate or low outbound utilization cannot establish success.
Repeat with one deliberately stopped reader, then reader joins/leaves, to verify configured expiry and credit redistribution without dropping the progressing group within the stated envelope.
Include many quiet documents and many idle subscribers followed by a write burst; verify resource-based admission, bounded catch-up, admission pause/resume, and reduced write throughput rather than eviction to a lower subscriber target.
Measure archive polls, CPU, allocation/copy volume, writer wait time, and latency.
If archive reads disappear but CPU or latency regresses, investigate canonical encoding, wakeups, and lock contention before adding complexity or declaring success.
Keep the result, including failed drains; it is an early design check, not final performance acceptance.

Exit condition: evidence supports continuing with this architecture, or the plan is revised before expanding implementation scope.

Use the performance acceptance gates below for this decision and step 5's final confirmation.

### 4. Complete Recovery And Backend Coverage

Wire the lag termination through existing error and lifecycle mechanisms.
Force a reader to lag, verify prompt release of its retained data, reconnect, and compare the resulting event sequence with the committed history.
Run the Fluid driver case with pending local operations and with both retained-state catch-up and a newer valid snapshot.
Check retry classification, pending-operation resubmission, audience cleanup, and continued editing.
Cover memory, buffered-file, and durable-file stacks, native and generated clients, and both network transports for their distinct responsibilities.
Include unannounced auxiliary subscriptions, finite sibling reads, restart with no retained payloads, control-only history, and buffered failure while idle.

Exit condition: clients recover without missing or duplicating operations, and reconnect does not depend on new server snapshot-selection policy.

### 5. Measure And Document

Run a short paired comparison against the pre-change baseline using the existing 32-document writer-and-observer workload at a known sustainable rate.
Keep backend, payload size, worker budget, affinity, warmup, measurement duration, and drain checks matched.
Measure CPU, latency, throughput, archive-read activity, retained bytes, and writer wait time.
Include charged peak bytes across stage transitions, downstream bytes, allocation/copy volume, reader count, and lag-eviction/reconnect counts.
Use the same numerical limits as the correctness tests and disclose any change to maximum event size or writer lag allowance.
Include a bounded slow-reader scenario separately from the steady-state throughput comparison.
Retain the constrained-egress fan-out case and a cross-document fairness case as distinct acceptance evidence, with connection limits raised explicitly to permit the requested readers.
Record policy identity and full configuration, hard ceilings, broadcast windows, egress allocation, and transport and policy deadlines with every result.
Compare at least the default and the simple alternative under matched offered load, resources, and reader behavior using the existing benchmark entry points.
Report admitted and served reader counts, admission delays/rejections, delivery progress and latency, fairness, policy expiries, transport failures, and reconnects alongside writer throughput.
Do not describe a policy as faster without disclosing whether it served fewer readers or terminated more subscriptions.
Retain failures and incomplete drains; do not turn this into an open-ended maximum-capacity campaign.

Exit condition: evidence shows that live journal reads are removed without violating resource, ordering, durability, or reconnect guarantees.
Report the measured CPU effect without promising the earlier diagnostic's speedup.

## Performance Acceptance

These thresholds are implementation decision gates, not service-level guarantees or claims of maximum capacity.
Freeze the baseline revision, workload configuration, metric definitions, and thresholds in checkpoint 0 before collecting candidate results.
Record any later change with its reason and rerun both sides; do not relax a threshold merely because the candidate missed it.

### Evidence And Matched Workload

The [retained production confirmation](historical/measurements/file-execution-e2e-20260922/README.md#production-confirmation) sustained approximately 999 delivered operations/s at 1,000 offered operations/s, with 123.53-123.94% service CPU and 12.98-13.65 ms worst-worker p95 latency.
The later read-offload diagnostic reduced median CPU from 125.62% to 90.70%, approximately 28%, but used unsafe inline filesystem reads and shorter samples.
It also retained an offloaded-control latency outlier of 610.84 ms.
Use these observations to justify a material CPU-improvement target and noise handling, not as interchangeable baseline samples or a promise of a 28% production gain.

Use a fresh pre-implementation baseline and candidate release build on the same machine and filesystem.
The primary workload is durable storage with 32 documents, one writer and one observer per document, 64-byte application payloads, 1,000 total offered operations/s, four native WebSocket generator processes, and 32 file workers.
Use the previously recorded eight service CPUs and four separate generator CPUs when available; otherwise record a fixed equivalent allocation for both sides.
Each generator receives an integer rate of 250 operations/s.
Use fresh storage for every sample, and do not mix WebTransport results into this WebSocket comparison.
The ordinary workload must not trigger lag eviction, policy expiry, reconnect, or subscriber rejection.

Run one startup/drain smoke pair, then three alternating-order baseline/candidate pairs.
Checkpoint 3 may use one warmup second and three measured seconds per sample for an early decision.
Checkpoint 5 uses three warmup seconds and ten measured seconds, followed by the existing ten-second drain allowance.
Do not pool the short and long samples.
Repeat the same paired workload with memory storage as the non-file regression control; use buffered storage for a paired smoke check and expand only if it exposes a regression.
This fixed-rate comparison is not a capacity search.

Use service-process CPU seconds per successfully delivered observer operation, with numerator and denominator covering the same measured interval, as the primary efficiency metric.
Also report raw CPU utilization, where 100% means one fully busy CPU, and generator CPU so client saturation is visible.
For each pair compute the candidate/baseline ratio; use the median of the three paired ratios rather than selecting the best runs.
Latency is measured from scheduled submission through observer delivery and includes admission/queue delay, preserving the existing harness semantics.
For each run retain the worst worker's p95, not an average of worker percentiles; compare the medians of those run-level values.

### Fixed-Rate Gates

| Metric | Checkpoint 3 continuation gate | Checkpoint 5 acceptance gate |
| --- | --- | --- |
| Durable CPU per delivered operation | Median paired ratio at most 0.90, with improvement in at least two of three pairs | Median paired ratio at most 0.85, with improvement in at least two of three pairs |
| Memory CPU per delivered operation | Median paired ratio at most 1.10 | Median paired ratio at most 1.10 |
| Delivered rate | Every candidate run delivers at least 98% of the offered rate during measurement | Same; at least 980 operations/s at the specified load |
| Durable latency | Candidate median worst-worker p95 at most the larger of 1.20 times baseline or baseline plus 2 ms, and at most 25 ms | Same |
| Memory latency | Candidate median worst-worker p95 at most the larger of 1.20 times baseline or baseline plus 1 ms | Same |
| Tail outliers | No candidate run with worst-worker p95 above 100 ms without investigation | Same; an unresolved excursion blocks acceptance even if the median passes |
| Completion and integrity | All submitted operations acknowledged and expected writer/observer deliveries complete by drain end; zero missing, duplicate, out-of-order, or corrupt events and zero worker errors | Same |
| Live archive work | Zero archive polls attributable to already-live delivery after handoff in the controlled fixture | Same, with real-service counters separating catch-up/recovery reads from live reads |

At the historical CPU level, the final CPU gate corresponds approximately to 105-107% CPU at unchanged throughput; use the matched ratio as the gate, not this machine-specific illustration.
The 15% target deliberately asks for less than the diagnostic's 28% reduction while requiring enough benefit to justify the added accounting and policy work.
Missing it is a performance decision to investigate or revisit, not permission to weaken durability, reader protection, or accounting.

A baseline that cannot sustain the workload with complete drains and a median durable p95 at most 25 ms does not establish a usable comparison.
Retain all failed attempts and label environmental or measurement uncertainty explicitly.
Allow at most one additional complete three-pair block after a diagnosed transient problem; report both blocks separately and do not cherry-pick replacements or take the better block automatically.
Unexplained disagreement is inconclusive and requires a user decision before broader coverage work or a performance-acceptance claim.
Use identical lightweight measurement on both builds and collect expensive tracing/allocation diagnostics in separate runs.

### Constrained Broadcast Gates

These are proposed engineering thresholds because the retained measurements do not establish a 100-reader broadcast baseline.
Start with one document, one writer, 100 admitted observer subscriptions, 64-byte payloads, memory storage, and WebTransport.
Count any writer-echo subscription in the actual fan-out and byte accounting.
Use a 1 MiB/s aggregate event-response egress budget for the controlled test, charged at a documented encoded-byte boundary; report physical link utilization separately rather than calling payload rate wire throughput.
Cross-check actual transport backpressure with a bounded network shaper or equivalent controlled transport test, since an application rate limiter alone does not prove socket behavior.
If shaping is unavailable, record that gate as unverified rather than substituting an unthrottled run.

Measure encoded bytes per event across all recipients, including envelope and framing overhead, and derive the egress-limited event rate from that quantity and the configured budget.
Offer 125% of that rate with bounded client-side submission storage.
Confirm the unthrottled path sustains the offered rate before using this as an egress test; otherwise lower the egress budget once and freeze that calibration before comparing policies.
Use a five-second warmup and twenty measured seconds; allow at most thirty seconds for the bounded accepted tail to drain after offered load stops.
Record unadmitted/cancelled attempts separately from accepted operations and reconcile every ambiguous outcome.
Run one early trial at checkpoint 3 and three trials for final acceptance.
Use the selected resource-aware policy with a five-second pending-delivery no-progress tolerance for this test configuration, not as an unmeasured production default.
Size and validate all windows, maximum-event-plus-control feasibility, stream limits, and transport deadlines before the run; report them with the result.

- Over the measured interval, completed encoded event-response bytes must use at least 80% of the configured egress budget.
   Require a final ten-second accepted event rate between 80% and 105% of the derived egress-limited rate, with bounded backlog and rising writer admission wait under excess offered load.
   Persisted throughput above that range with growing delivery debt is not success.
- Require zero evictions, expiries, reconnects, or lost deliveries among the protected progressing readers.
   The declared no-disconnect envelope supplies each pending reader with a delivery-progress opportunity at least once per second and excludes injected outages exceeding the configured expiry tolerance.
   A failed service opportunity is a scheduling/transport diagnosis, not evidence that the reader was faulty.
- Stop one observer completely while the others continue.
   Verify that its server send-completion boundary actually stalls; stopping application reads while transport buffers continue draining is insufficient.
   Require its policy termination within six seconds of the last credited progress once it has pending delivery, including at most one second of reevaluation/scheduling allowance, and zero terminations of the progressing group.
   Require at least 80% egress utilization again during a ten-second interval beginning no later than two seconds after its credit is released.
   With expiry disabled, require bounded backpressure instead of a throughput or termination deadline.
- Enforce charged byte, entry, subscription, and pending-cleanup limits at every sampled transition and in deterministic fixtures, including reserved publication slack.
   All broadcast debt must return to zero after successful drain and termination, and remaining ownership must match the live membership/control state.
   Report peak resident memory and allocation/copy volume, but do not equate process resident memory with the sequencer's logical budget or require it to fall immediately after deallocation.
- For equal-weight, continuously backlogged documents in the cross-document case, require each to receive at least 80% of its configured equal share over the final ten seconds.
   Measure this while catch-up traffic uses its configured bounded allocation; compare live shares against the remaining live-service budget.
   Unequal configured weights must use their declared shares instead.

Run policy alternatives under the same offered load, budgets, and reader behavior, reporting admitted/served counts and terminations.
An intentionally different policy need not meet the default's expiry/no-disconnect promises, but must preserve hard bounds, ordering, and exact accounting.
Do not claim an efficiency improvement by dropping readers, omitting drain work, increasing transport buffering without accounting, or lowering the offered workload after observing failure.
Keep the existing one-million-submission and 4 GiB service resident-memory safety guards alongside bounded generator queues and explicit run deadlines.
Hitting a safety guard fails or invalidates the run; it does not establish sustainable capacity.

## Validation Matrix

| Boundary | Required focused evidence |
| --- | --- |
| Floors | Equality accepted; stale references rejected; monotonic enforcement; frozen batch announcements; old prepared references ordered before newer announcements; control positions referenceable |
| Capacity | Count and byte limits; peak input/output overlap; maximum-size event after small retained suffix; whole-batch publication slack; bounded waiting admissions and memberships; lifecycle reserve; capacity wakeups |
| Lifecycle credit | Maximum event plus mandatory control headroom fits; several announced writers close while an independent reader is stopped with expiry disabled; settlement does not recycle delivery credit; bounded pending closes; immediate revocation; cloned close callers share one leave without early success; cancellation retains cleanup; delivery/detachment resumes exactly-once ordered leaves |
| Broadcast pressure | Entire accepted-prefix reservation; fan-out-weighted charges; actual send-completion credit; one writer/100 readers under a declared saturated service envelope; bounded backlog and no reconnect churn within expiry tolerance; stopped-reader expiry; joins/leaves; cross-document and catch-up fairness |
| Policy boundary | Default and alternative share accounting and ordering tests; approval cannot bypass hard limits; atomic recheck after approval; outliers remain charged and protected; deterministic deadline wakeups; exact-once termination; bounded policy state |
| Subscriber admission | Many idle readers; idle-to-busy burst; maximum-event feasibility at reader ceiling; no event-idle expiry; pressure hysteresis; outlier-resistant active-reader signal; bounded deferred joins and catch-up; no eviction to meet a reduced admission target |
| Publication | Delayed durable append remains invisible; buffered acknowledgment unchanged; control events included; cancellation retains dispatched work and rejects undispatched successors correctly |
| Settlement progress | Existing live observer receives a committed event after its only submitter cancels; no subsequent operation or archive read; idle and batched drivers; work-installation wakeup races; reader cancellation and multiple pollers |
| Reclamation | No readers; fastest and slowest readers; dropped streams; multiple subscriptions; full-buffer eviction without enqueueing; blocked-send cancellation; separately bounded downstream ownership |
| Handoff | Concurrent append and reclamation; late subscriber during pending cleanup preserves leave reservations and eventual cleanup after reader progress; empty tail; restart with empty live buffer; finite reads; coherent progress; no missed wakeups, gaps, or duplicates |
| Recovery | Runtime-only floor lost on restart; committed floor retained; pending announcement cancellation; checkpoint replay; uncertain append fail-stop |
| Failure notification | Buffered failure after acknowledgment with no later writes; invalidation racing registration; late subscribers; idle-reader wakeup; blocked-send termination |
| Clients | Retryable lag termination; real reconnect and catch-up; pending writes; newer snapshot; continued editing; no repeated immediate eviction; auxiliary eviction leaves finite sibling reads intact |
| Performance | No archive polls for steady-state live delivery; bounded memory with stalled readers; memory-backend and fan-out controls; matched drain-complete CPU, copies, and latency comparison |

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

- One sequencer owner bounds admission, publication, and shared live retention, with separate queues where their lifecycles differ and explicit backend and downstream budgets.
- Live file-backed readers avoid journal reads, while historical reads retain their existing filesystem isolation and semantics.
- Actively polled live readers drive successful retained publication after submitter cancellation without depending on subsequent traffic or lifecycle operations.
- Backend invalidation reaches idle live readers and blocked sends without journal polling or a subsequent write.
- One enforcement floor governs stale-reference rejection and lagging live-reader disconnection; delayed announcements remain safe cleanup guarantees.
- Already accepted work has reserved capacity to settle; future writer admission is backpressured by both unfinished storage work and bounded broadcast obligations.
- Lifecycle dispatch also reserves broadcast credit; indefinite reader protection may delay close, replacement, and graceful shutdown completion without blocking authority revocation or growing cleanup beyond membership limits.
- A small synchronous trait separates subscriber admission and expiry policy from shared accounting, floor enforcement, and delivery; no policy can bypass hard limits.
- The resource-aware default admits quiet-document readers within actual budgets, pauses new joins under sustained pressure, and protects existing readers through writer backpressure until explicit termination.
- Expiry and transport deadlines state their service assumptions without claiming reliable congestion diagnosis; alternate policies can intentionally trade writer progress for reader protection.
- Construction-time policy selection supports reproducible benchmarks and deterministic stress tests, with policy identity, configuration, and service outcomes recorded.
- Existing client catch-up and snapshot mechanisms recover from lag eviction, with any necessary compatibility changes documented and tested.
- Focused regressions, canonical gates, and a bounded matched performance comparison are recorded before the implementation is declared complete.
