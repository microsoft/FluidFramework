# Sea Protocol Simplification Plan

Created: 2026-09-22.
Status: initial implementation and follow-up review complete; I6 remains blocked by an unrelated root formatting failure.
The plan is not fully closed until the required repository build passes.

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
- [x] **I5: Decide and implement the framing boundary.** Design kind-first messages without an outer message length using bounded schema-aware incremental decoding.
  Require limits before allocation, an aggregate message budget, cancellation-safe partial state, and linear parsing across fragmented input.
  If this requires excessive permanent parser machinery, retain bounded length-delimited framing and record the reason and measured size cost here.
  Do not silently omit this decision when finishing the initial changes.
- [ ] **I6: Update contracts and validate the complete initial change.** Update owning documentation, examples, generated bindings, and generated API reports through their normal build tasks.
  Follow repository changeset requirements for affected user-facing behavior and APIs; no data migration is required.
  Record the resulting wire layout, byte-count evidence, and validation results below.
- [x] **I7: Return to the follow-up review.** Complete the review checklist below immediately after initial validation and before reporting the whole plan complete.

## Follow-up Work

These items are candidates, not an instruction to implement all of them.
Keep them visible until each has an explicit disposition.

| ID | Candidate | Expected benefit | Permanent complexity to evaluate | Status |
| --- | --- | --- | --- | --- |
| F1 | Small reusable durable session numbers | Typically one encoded byte per session number, independent of document age | Durable allocation, safe reuse, incarnation anchors, replay and snapshot initialization | Deferred here until the durable allocation/anchor design satisfies every contract below; highest-value next design candidate |
| F2 | Session-reference encoding only when changed | Removes repeated reference values and tags during bursts | Per-session decoding state, initialization, exact event association | Deferred here until a representative trace measures reference-change frequency and includes stream initialization/control bytes in the comparison |
| F3 | Minimum-reference updates only when changed | Removes repeated admission-floor metadata | Ordered updates at committed-event boundaries, replay initialization | Deferred here until measured floor-change frequency justifies state and a mid-history replay/reset test design is specified |
| F4 | Explicit session selection for runs | Removes a session number from subsequent events in the run | Selected-session state and switching records; benefit depends on interleaving | Deferred here until F1 has a decision and measured run lengths show positive net savings after switches and initialization |
| F5 | Delta-encoded or implicit delivered positions | Reduces or removes event-position bytes | Gaps, membership positions, bounded reads, snapshots and stream restarts | Implicit positions rejected under the current non-contiguous contract; deltas deferred here until a trace measures position-varint cost and a reset/gap encoding is specified |

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

- [x] Record baseline and resulting encoded sizes for submit, receipt, delivery, and control messages using the actual encoder.
- [x] Cover payload and numeric varint boundaries, blob presence, stream setup, and representative session identity sizes.
- [x] Separate Sea bytes from QUIC or WebSocket overhead; count control updates, receipts, and fan-out rather than quoting only the smallest event.
- [x] Test fragmented and coalesced messages, malformed or excessive lengths, incomplete EOF, unsupported kinds followed by valid requests, and cancellation during receive or response wait.
- [x] Test ordered receipts and interleaved notifications without correlation IDs across all relevant stream roles.
- [x] Preserve accepted-prefix and departure recovery tests, including lost acknowledgments and connection termination.
- Not applicable to this implementation: stateful metadata optimizations were not introduced.
  Their stream initialization, mid-session replay, reconnect, and exact-boundary tests remain prerequisites for F2-F5.
- Deferred with F2-F4: measure reference-change frequency, minimum-floor changes, same-session run lengths, and session churn before selecting encodings.
- [ ] Run the canonical Rust workspace checks, documentation checker, repository policy check, and required repository build from the development guide.
- [x] Regenerate bindings and API reports, and run affected package, Fluid integration, native transport, and real browser checks appropriate to the changed boundaries.

A two-byte no-blob submit means one kind byte plus one payload-length byte for a payload below 128 bytes, with its reference already established.
It excludes reference updates, receipts, initialization, and lower transport overhead.
Delivered events still need position and session information unless a separately accepted encoding makes them implicit.

## Required Follow-up Review

- [x] Compare measured initial results against the goals and review every F1 through F5 row; the unrelated I6 formatting blocker does not prevent this design review.
- [x] Give each candidate a disposition: implement next, reject with reasoning or evidence, or defer with a concrete revisit trigger and a linked tracker if moved elsewhere.
- [x] No follow-up implementation accepted in this change; the candidates and their prerequisites remain tracked here.
- [x] No candidate remains merely "pending" and no accepted follow-up implementation is unfinished.

Initial completion must be reported as "initial changes complete; follow-up review outstanding" until I7 is complete.
Do not replace the follow-up review with a generic suggestion to optimize later.

## Results and Decisions

Update this section as work progresses; link tests, measurements, and any continuation plans.

| Milestone | Result or decision | Evidence |
| --- | --- | --- |
| Initial changes | I1-I5 implemented; full validation remains open | 20 client/protocol tests, 26 server tests including WebSocket, 23 neutral-session tests, and 26 driver tests passed; seven WASM configurations regenerated; plan commit `03891e47514` |
| Fail-closed recovery | Unknown kind followed by valid submit closes its connection, preserves the accepted prefix and terminal departure, and does not stop the listener | `host::tests::server_survives_malformed_and_abandoned_response_streams` |
| Encoded sizes | Small no-blob submit: N+8 bytes (was N+17); receipt: 6 (was 14); delivery with 16-byte session: N+29 (was N+55); close/ack: 5 (was 13) | `protocol::tests::event_sizes_cover_varint_boundaries_and_blob_presence`; present references and positions below 128, payload below 128, prior delivery also had a 16-byte author |
| Framing decision | Retain the four-byte outer length after the leading kind; no correlation ID. Unknown kinds fail immediately. | A schema-aware resumable parser would duplicate all message layouts; retrying postcard deserialization on partial input risks repeated parsing and allocation. The retained length costs four bytes per message and keeps bounded extraction independent of schemas. |
| Validation | Rust formatting, Clippy, rustdoc, workspace build and all-target/all-feature tests passed; policy and documentation checks passed; aggregate package/Fluid/Chromium tests passed | `cargo` canonical gates; `pnpm policy-check --path rust-service`; `pnpm --dir rust-service/tests/sea-integration-tests run test:all` (13 tasks) |
| Fluid end-to-end | 691 passing, 493 pending, no failures; current-version `sea-websocket` selection with fail-fast disabled | Built `packages/test/test-end-to-end-tests` with `--task build:test:esm`, then ran `pnpm --dir packages/test/test-end-to-end-tests run test:realsvc:sea:report` |
| API review | Removed fields and arguments are all `@internal`; generated reports updated; no customer-facing changeset or API Council review required | Compared against user-selected plan commit `03891e47514` |
| Follow-up review | F1-F4 and delta positions deferred with concrete prerequisites; implicit positions rejected under the current contract | Dispositions above; no automatic scope expansion |
| Plan closure | Blocked only on repository-wide formatting | `pnpm build:fast` compiled its tasks but failed root Biome on untouched `historical/measurements/browser-dds-comparison/websocket-summary.json`; historical evidence was not modified |

### Byte Accounting

The retained wire envelope is kind (one byte), length (four bytes), and postcard body.
Length includes the kind and body, excluding the length itself.
Small present references cost two bytes (option tag plus varint); the payload length costs one byte below 128 bytes.
For N payload bytes and R recipients using 16-byte sessions, one submission plus receipt and delivery costs `(N+8) + 6 + R*(N+29)` Sea bytes, versus `(N+17) + 14 + R*(N+55)` previously.
The savings are `17 + 26*R` bytes per event for this case.
Neither formula includes QUIC packet/stream overhead or WebSocket framing; the fallback additionally uses its existing DATA record tag per chunk.
Blob-bearing directory events retain 34 bytes for their option tag, tree kind, and 32-byte identity.
Actual-encoder tests cover payload lengths 0, 127, 128, 16383, and 16384; numeric positions at both varint boundaries; session lengths 1, 16, 127, and 128; and both blob states.
Opening a session also removes its author byte string and every opening frame loses eight correlation bytes.

### Contract Evidence

Core and sequencer tests cover independent session authority, terminal departures, recovery, and the new persisted envelopes.
Compression and encryption retain their conformance tests; their only metadata change is forwarding session-only events.
The encryption authority test now closes its old session explicitly.
Native multi-hop composition covers metadata preservation, snapshot rejection/retry, decorators, and recovery.
Client fixtures cover cancelled author/content/snapshot/signal exchanges and interleaved signal/snapshot notifications.
Server tests cover immediate unknown-kind rejection, accepted prefixes followed by malformed suffixes, connection cleanup, and listener survival.
Generated memory and browser tests cover the WASM boundary; driver and SharedTree tests cover application-owned attribution and recovery.
Benchmark/example edits only adapt session construction; existing Rust smoke tests and generated-client/browser scenarios cover those shared APIs.
