# Sea Protocol Simplification Plan

Created: 2026-09-22.
Status: initial implementation, validation, and follow-up review complete.
The former I6 formatting blocker is resolved; subsequent canonical checks and the required repository build passed for the state committed as `dba3ce11f58`.
Numeric session identities are implemented in protocol 11; session-number reuse and stateful metadata reductions remain deferred below.

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

- [x] **I1: Remove Sea author identity.** Remove author fields and types from core abstractions, sequencer storage metadata, protocol, native and browser bindings, and package interfaces.
  Inspect driver consumers of `writer`; move any required application attribution into application payloads or membership metadata rather than retaining a Sea author concept.
  Preserve session-based submission ordering and recovery.
- [x] **I2: Remove correlation IDs.** Specify ordered exchanges per logical stream, including response completion and notification classification by kind.
  Remove the wire field and correlation-tracking machinery.
  Ensure a cancelled exchange cannot leave a response that is mistaken for the next request's response; drain or terminate the affected stream according to its contract.
- [x] **I3: Preserve fail-closed dispatch.** Verify unknown kinds, wrong-role messages, and malformed messages terminate the owning connection without processing later requests.
  Test the boundary between admitted earlier submissions and rejected later bytes, including cleanup and recovery.
- [x] **I4: Specialize the common no-blob event.** Use distinct no-blob and blob-bearing kinds, mapped to one internal event representation.
  Retain postcard varints for variable-size lengths and numeric fields.
  Avoid a cross-product of kinds for every metadata combination.
- [x] **I5: Decide and implement the framing boundary.** Use a bounded four-byte length before the message kind and postcard payload.
  Require limits before allocation, an aggregate message budget, cancellation-safe partial state, and linear parsing across fragmented input.
  If this requires excessive permanent parser machinery, retain bounded length-delimited framing and record the reason and measured size cost here.
  Do not silently omit this decision when finishing the initial changes.
- [x] **I6: Update contracts and validate the complete initial change.** Update owning documentation, examples, generated bindings, and generated API reports through their normal build tasks.
  Follow repository changeset requirements for affected user-facing behavior and APIs; no data migration is required.
  Record the resulting wire layout, byte-count evidence, and validation results below.
- [x] **I7: Return to the follow-up review.** Complete the review checklist below immediately after initial validation and before reporting the whole plan complete.

## Follow-up Work

These items are candidates, not an instruction to implement all of them.
Keep them visible until each has an explicit disposition.

| ID | Candidate | Expected benefit | Permanent complexity to evaluate | Status |
| --- | --- | --- | --- | --- |
| F1 | Reuse allocated durable session numbers | Keep encoded numbers small under document age and connection churn | Safe reuse, incarnation anchors, replay and snapshot initialization | Numeric allocation without reuse is complete in protocol 11. Reuse remains deferred until churn measurements justify it and the anchor design satisfies every contract below. |
| F2 | Session-reference encoding only when changed | Removes repeated reference values and tags during bursts | Per-session decoding state, initialization, exact event association | Deferred here until a representative trace measures reference-change frequency and includes stream initialization/control bytes in the comparison |
| F3 | Minimum-reference updates only when changed | Removes repeated admission-floor metadata | Ordered updates at committed-event boundaries, replay initialization | Deferred here until measured floor-change frequency justifies state and a mid-history replay/reset test design is specified |
| F4 | Explicit session selection for runs | Removes a session number from subsequent events in the run | Selected-session state and switching records; benefit depends on interleaving | Evaluate against the implemented numeric-ID baseline; deferred until measured run lengths show positive net savings after framed switches and initialization. Reuse is not a prerequisite. |
| F5 | Delta-encoded or implicit delivered positions | Reduces or removes event-position bytes | Gaps, membership positions, bounded reads, snapshots and stream restarts | Implicit positions rejected under the current non-contiguous contract; deltas deferred here until a trace measures position-varint cost and a reset/gap encoding is specified |

### Compact Session Identity

[Independent checkpoint recovery](CHECKPOINT_PLAN.md) implemented sequencer-allocated `u64` identities with persisted reservations and no reuse.
Protocol version 11 uses those numbers directly: IDs 1 through 127 occupy one postcard byte, 128 through 16383 occupy two, and larger IDs require up to ten.
Restart skips the unused suffix of a reserved range, so encoded width depends on allocations and reservations, not just concurrent sessions.
This completes compact numeric identity, but not F1's proposed reuse and incarnation-anchor design.

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
For F4, a standalone selection message under the retained framing costs six bytes for a one-byte session number: one kind byte, four length bytes, and the session number.
Counting only that switch cost against one saved session byte per delivered event, it wins at seven events per run, ties at six, and loses below six; initialization and reset costs must also be included.
The earlier two-byte switch estimate excluded the retained four-byte length and is not the current framed baseline.
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

- [x] Record baseline and resulting encoded sizes for submit, receipt, delivery, and control messages using the actual encoder.
- [x] Cover payload and numeric varint boundaries, blob presence, stream setup, and representative session identity sizes.
- [x] Separate Sea bytes from QUIC or WebSocket overhead; count control updates, receipts, and fan-out rather than quoting only the smallest event.
- [x] Test fragmented and coalesced messages, malformed or excessive lengths, incomplete EOF, unsupported kinds followed by valid requests, and cancellation during receive or response wait.
- [x] Test ordered receipts and interleaved notifications without correlation IDs across all relevant stream roles.
- [x] Preserve accepted-prefix and departure recovery tests, including lost acknowledgments and connection termination.
- Not applicable to this implementation: stateful metadata optimizations were not introduced.
  Their stream initialization, mid-session replay, reconnect, and exact-boundary tests remain prerequisites for F2-F5.
- Deferred with F2-F4: measure reference-change frequency, minimum-floor changes, same-session run lengths, and session churn before selecting encodings.
- [x] Run the canonical Rust workspace checks, documentation checker, repository policy check, and required repository build from the development guide.
- [x] Regenerate bindings and API reports, and run affected package, Fluid integration, native transport, and real browser checks appropriate to the changed boundaries.

A hypothetical two-byte no-blob submit counts only one kind byte plus one payload-length byte for a payload below 128 bytes, with its reference already established.
It is not an implemented wire layout and excludes the retained four-byte length, reference establishment, receipts, initialization, and lower transport overhead.
Delivered events still need position and session information unless a separately accepted encoding makes them implicit.

## Required Follow-up Review

- [x] Compare measured initial results against the goals and review every F1 through F5 row; the review was completed before the former I6 formatting blocker was resolved.
- [x] Give each candidate a disposition: implement next, reject with reasoning or evidence, or defer with a concrete revisit trigger and a linked tracker if moved elsewhere.
- [x] No follow-up implementation accepted in this change; the candidates and their prerequisites remain tracked here.
- [x] No candidate remains merely "pending" and no accepted follow-up implementation is unfinished.

Initial completion must be reported as "initial changes complete; follow-up review outstanding" until I7 is complete.
Do not replace the follow-up review with a generic suggestion to optimize later.

## Results and Decisions

Update this section as work progresses; link tests, measurements, and any continuation plans.

| Milestone | Result or decision | Evidence |
| --- | --- | --- |
| Initial changes | I1-I7 complete; the original validation blocker was resolved by subsequent successful checks | Original evidence: 20 client/protocol tests, 26 server tests including WebSocket, 23 neutral-session tests, and 26 driver tests passed; seven WASM configurations regenerated; plan commit `03891e47514`. Closure evidence below. |
| Fail-closed recovery | Unknown kind followed by valid submit closes its connection, preserves the accepted prefix and terminal departure, and does not stop the listener | `host::tests::server_survives_malformed_and_abandoned_response_streams` |
| Historical initial encoded sizes | Small no-blob submit: N+8 bytes (was N+17); receipt: 6 (was 14); delivery with 16-byte session: N+29 (was N+55); close/ack: 5 (was 13) | Initial comparison before numeric session IDs; present references and positions below 128, payload below 128, prior delivery also had a 16-byte author |
| Current protocol-11 encoded sizes | Small no-blob submit: N+8 bytes; receipt: 6; application-event delivery: N+13; close/ack: 5 | `protocol::tests::event_sizes_cover_varint_boundaries_and_blob_presence`; one-byte numeric session ID, present references and positions below 128, payload below 128 |
| Framing decision | Place the four-byte outer length before the kind; no correlation ID. | The receiver validates the complete bound before reading the remaining frame. A schema-aware resumable parser would duplicate all message layouts; retrying postcard deserialization on partial input risks repeated parsing and allocation. |
| Validation | Rust formatting, Clippy, rustdoc, workspace build and all-target/all-feature tests passed; policy and documentation checks passed; aggregate package/Fluid/Chromium tests passed | `cargo` canonical gates; `pnpm policy-check --path rust-service`; `pnpm --dir rust-service/tests/sea-integration-tests run test:all` (13 tasks) |
| Fluid end-to-end | 691 passing, 493 pending, no failures; current-version `sea-websocket` selection with fail-fast disabled | Built `packages/test/test-end-to-end-tests` with `--task build:test:esm`, then ran `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea:report` |
| API review | Removed fields and arguments are all `@internal`; generated reports updated; no customer-facing changeset or API Council review required | Compared against user-selected plan commit `03891e47514` |
| Follow-up review | Numeric session IDs subsequently implemented; reuse, F2-F4, and delta positions remain deferred with concrete prerequisites; implicit positions rejected | Dispositions above; no follow-up encoding selected by this tracker refresh |
| Initial plan closure | Former root formatting blocker resolved; canonical Rust checks, documentation and policy checks, and `pnpm build:fast` subsequently passed | State committed as `dba3ce11f58`, validated on 2026-09-22; root build completed 528 tasks successfully in 80.258 seconds. Earlier package/Fluid/Chromium evidence remains recorded above; those suites were not rerun for this documentation refresh. |

### Byte Accounting

The current baseline is protocol 12 with length-first framing and numeric session IDs.
The retained wire envelope is length (four bytes), kind (one byte), and postcard body.
Length includes the kind and body, excluding the length itself.
Let N be payload bytes, L the postcard width of N, P the delivered position width, S the numeric session-ID width, Q the submission/event reference width, and M the minimum-reference width.
With present references and no blob, encoded sizes are:

| Message | Sea bytes | Small-value case |
| --- | --- | --- |
| Submit | `5 + (1 + Q) + L + N` | `N + 8` |
| Receipt | `5 + P` | `6` |
| Application-event delivery | `5 + 1 + P + S + (1 + Q) + (1 + M) + L + N` | `N + 13` |
| Close or acknowledgment | `5` | `5` |

The delivery's additional one-byte field is the session-event kind.
The small-value case assumes payload length, positions, present references, and session ID all fit in one-byte varints; absent references use only their one-byte option tag.
For R recipients, one submission plus receipt and delivery costs `(N+8) + 6 + R*(N+13)` Sea bytes in that case.
The historical initial simplification with 16-byte sessions cost `(N+8) + 6 + R*(N+29)`; its predecessor with 16-byte author and session identities cost `(N+17) + 14 + R*(N+55)`.
Numeric IDs therefore save another `16*R` bytes over the initial simplification, or `17 + 42*R` bytes over that predecessor, under these specific assumptions.
These formulas exclude stream setup, membership/control traffic, QUIC packet/stream overhead, and WebSocket framing; fallback record overhead is accounted for separately at the transport layer.
Blob-bearing directory events retain 34 bytes for their option tag, tree kind, and 32-byte identity.
Actual-encoder tests cover payload lengths 0, 127, 128, 16383, and 16384; positions 127, 128, 16383, and 16384; session IDs 1, 127, 128, 16383, 16384, and `u64::MAX`; and both blob states.
The initial simplification also removed the opening author byte string and eight correlation bytes from each opening frame.
Representative trace accounting for changing references, floor changes, session runs, position deltas, and initialization/reset traffic remains deferred; the small-value examples are not workload measurements.

### Contract Evidence

Core and sequencer tests cover independent session authority, terminal departures, recovery, and the new persisted envelopes.
Compression and encryption retain their conformance tests; their only metadata change is forwarding session-only events.
The encryption authority test now closes its old session explicitly.
Native multi-hop composition covers metadata preservation, snapshot rejection/retry, decorators, and recovery.
Client fixtures cover cancelled author/content/snapshot/signal exchanges and interleaved signal/snapshot notifications.
Server tests cover immediate unknown-kind rejection, accepted prefixes followed by malformed suffixes, connection cleanup, and listener survival.
Generated memory and browser tests cover the WASM boundary; driver and SharedTree tests cover application-owned attribution and recovery.
Benchmark/example edits only adapt session construction; existing Rust smoke tests and generated-client/browser scenarios cover those shared APIs.
