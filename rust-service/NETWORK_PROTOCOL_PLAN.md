# Sea Protocol Simplification Plan

Created: 2026-09-22.
Status: planned; implementation has not started under this plan.

This is an active work tracker, not a description of supported behavior.
Completing the initial changes does not complete this plan: return to the follow-up review before closing it.

## Goals and Constraints

Sea identifies session incarnations and orders their events; applications decide who those sessions represent.
Reduce repeated event metadata and remove responsibilities that do not belong in Sea.
Evaluate designs by ongoing maintenance cost and encoded size, not implementation effort.
There are no existing users or data requiring migration or backward compatibility.
Update both ends of the protocol together without retaining obsolete compatibility paths.

Preserve accepted submission prefixes, durable terminal departures, application-owned uncertain-submission recovery, and the durable monotonic minimum-reference floor.
Treat the floor as an admission constraint, not merely the instantaneous minimum reference of connected clients.
Use sequential message parsing; do not add parallel parsing or skip unsupported requests.
On an unknown message kind, fail the connection and stop admitting subsequent requests.
Previously admitted work may have committed; connection failure must not imply rollback.

## Initial Changes

Complete these as focused changes with local tests, then run the integration gates.
Use the [coordination workflow](../.github/skills/rust-service-coordination/SKILL.md) when starting implementation to choose direct work or an explicitly approved iteration.
This plan does not itself create an iteration or authorize parallel workstreams.

- [ ] **I1: Remove Sea author identity.** Remove author fields and types from core abstractions, sequencer storage metadata, protocol, native and browser bindings, and package interfaces.
  Inspect driver consumers of `writer`; move any required application attribution into application payloads or membership metadata rather than retaining a Sea author concept.
  Preserve session-based submission ordering and recovery.
- [ ] **I2: Remove correlation IDs.** Specify ordered exchanges per logical stream, including response completion and notification classification by kind.
  Remove the wire field and correlation-tracking machinery.
  Ensure a cancelled exchange cannot leave a response that is mistaken for the next request's response; drain or terminate the affected stream according to its contract.
- [ ] **I3: Preserve fail-closed dispatch.** Verify unknown kinds, wrong-role messages, and malformed messages terminate the owning connection without processing later requests.
  Test the boundary between admitted earlier submissions and rejected later bytes, including cleanup and recovery.
- [ ] **I4: Specialize the common no-blob event.** Use distinct no-blob and blob-bearing kinds, mapped to one internal event representation.
  Retain postcard varints for variable-size lengths and numeric fields.
  Avoid a cross-product of kinds for every metadata combination.
- [ ] **I5: Decide and implement the framing boundary.** Design kind-first messages without an outer message length using bounded schema-aware incremental decoding.
  Require limits before allocation, an aggregate message budget, cancellation-safe partial state, and linear parsing across fragmented input.
  If this requires excessive permanent parser machinery, retain bounded length-delimited framing and record the reason and measured size cost here.
  Do not silently omit this decision when finishing the initial changes.
- [ ] **I6: Update contracts and validate the complete initial change.** Update owning documentation, examples, generated bindings, and generated API reports through their normal build tasks.
  Follow repository changeset requirements for affected user-facing behavior and APIs; no data migration is required.
  Record the resulting wire layout, byte-count evidence, and validation results below.
- [ ] **I7: Return to the follow-up review.** Complete the review checklist below immediately after initial validation and before reporting the whole plan complete.

## Follow-up Work

These items are candidates, not an instruction to implement all of them.
Keep them visible until each has an explicit disposition.

| ID | Candidate | Expected benefit | Permanent complexity to evaluate | Status |
| --- | --- | --- | --- | --- |
| F1 | Small reusable durable session numbers | Typically one encoded byte per session number, independent of document age | Durable allocation, safe reuse, incarnation anchors, replay and snapshot initialization | Pending review after I6 |
| F2 | Author-reference encoding only when changed | Removes repeated reference values and tags during bursts | Per-session decoding state, initialization, exact event association | Pending review after I6 |
| F3 | Minimum-reference updates only when changed | Removes repeated admission-floor metadata | Ordered updates at committed-event boundaries, replay initialization | Pending review after I6 |
| F4 | Explicit session selection for runs | Removes a session number from subsequent events in the run | Selected-session state and switching records; benefit depends on interleaving | Pending measurement after F1 decision |
| F5 | Delta-encoded or implicit delivered positions | Reduces or removes event-position bytes | Gaps, membership positions, bounded reads, snapshots and stream restarts | Pending contract review after I6 |

### Compact Session Identity

For F1, prefer one canonical session identity model over adding durable opaque identities plus a second wire-alias layer.
A proposed reuse rule is that the previous incarnation's durable leave position must be strictly below the minimum reference at reassignment.
Establish an anchor at or above that minimum before the new client can submit events.
The session number plus that retained anchor distinguishes incarnations; the anchor need not accompany every event.
An event reference may provide the anchor when it satisfies the boundary rule.

Before accepting this design, establish and test:

- A durable leave is terminal; no later event from that incarnation can commit.
- Allocation and anchor establishment cannot leave admitted events with an unidentified incarnation.
- Reuse decisions and incarnation interpretation survive restart, replay from a snapshot, and old clients recovering uncertain submissions.
- An old number and anchor do not authorize writes under a newer incarnation.
- Historical evidence retention is compatible with recovery; number reuse alone does not permit deleting that evidence.
- Number size depends on active sessions plus departed sessions not yet eligible for reuse, including under high connection churn or a slowly advancing floor.

### Stateful Wire Encoding

For F2 and F3, initially treat updates as wire control state rather than separately persisted archive events.
Reconstruct complete event metadata at the decoder boundary.
Place updates and affected events on the same ordered stream; another QUIC stream does not establish the required ordering.
Initialize or reset all decoding state when starting any live, bounded-history, or resumed stream, including a stream beginning after the original session start.

Compare an unchanged-reference kind plus a reference-included variant against standalone reference updates.
Measure bytes when references change on every event as well as when they remain stable.
For F4, a one-byte selection kind plus a one-byte session number costs two bytes per run: it wins over a one-byte per-event session number at three or more events, ties at two, and loses at one.
For F5, require an explicit contiguous-position contract before inferring positions; otherwise evaluate deltas or retain explicit positions.

## Lower-priority Alternatives

Do not include these in the initial work.
Reopen them only with evidence that the simpler design has a material remaining cost.

- Fixed-width short, medium, and long payload variants: postcard lengths already cover the small case in one byte.
- A message-kind combination for every optional metadata field: increases the state and test matrix for small incremental savings.
- Persisted selection or reference-only records solely to compress network traffic: changes archive and recovery semantics unnecessarily.
- Whole-stream compression: adds state, reset rules, and buffering concerns beyond explicit metadata reduction.
- Combining receipts with subscription delivery: couples submission completion to event consumption and backpressure.

## Measurement and Validation

Start with existing tests in the owning crates and extend them only for distinct behavioral risks.
Use the [development requirements](DEVELOPMENT.md) as the authority for workspace checks, repository policy, generated-client builds, and regression coverage.
Protocol changes require both native and browser transport coverage; preserve the WebSocket fallback and signal delivery contracts as well as event traffic.

- [ ] Record baseline and resulting encoded sizes for submit, receipt, delivery, and control messages using the actual encoder.
- [ ] Cover payload and numeric varint boundaries, blob presence, stream setup, and representative session identity sizes.
- [ ] Separate Sea bytes from QUIC or WebSocket overhead; count control updates, receipts, and fan-out rather than quoting only the smallest event.
- [ ] Test fragmented and coalesced messages, malformed or excessive lengths, incomplete EOF, unsupported kinds followed by valid requests, and cancellation during receive or response wait.
- [ ] Test ordered receipts and interleaved notifications without correlation IDs across all relevant stream roles.
- [ ] Preserve accepted-prefix and departure recovery tests, including lost acknowledgments and connection termination.
- [ ] For any implemented stateful optimization, test stream initialization, replay starting mid-session, reconnect, and metadata changes at exact event boundaries.
- [ ] Measure reference-change frequency, minimum-floor changes, same-session run lengths, and session churn before selecting F2 through F4 encodings.
- [ ] Run the canonical Rust workspace checks, documentation checker, repository policy check, and required repository build from the development guide.
- [ ] Regenerate bindings and API reports, and run affected package, Fluid integration, native transport, and real browser checks appropriate to the changed boundaries.

A two-byte no-blob submit means one kind byte plus one payload-length byte for a payload below 128 bytes, with its reference already established.
It excludes reference updates, receipts, initialization, and lower transport overhead.
Delivered events still need position and session information unless a separately accepted encoding makes them implicit.

## Required Follow-up Review

- [ ] After I6, compare measured initial results against the goals and review every F1 through F5 row.
- [ ] Give each candidate a disposition: implement next, reject with reasoning or evidence, or defer with a concrete revisit trigger and a linked tracker if moved elsewhere.
- [ ] For each accepted candidate, record its contract, focused validation, measured size effect, and final outcome here.
- [ ] Before closing this plan, ensure no candidate remains merely "pending" and no accepted implementation remains unfinished without a linked continuation plan.

Initial completion must be reported as "initial changes complete; follow-up review outstanding" until I7 is complete.
Do not replace the follow-up review with a generic suggestion to optimize later.

## Results and Decisions

Update this section as work progresses; link tests, measurements, and any continuation plans.

| Milestone | Result or decision | Evidence |
| --- | --- | --- |
| Initial changes | Not started | None yet |
| Framing decision | Pending I5 | None yet |
| Follow-up review | Required after I6 | None yet |
| Plan closure | Open | None yet |