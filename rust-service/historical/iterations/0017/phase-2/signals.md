# Iteration 0017: signals Report

Status: bounded audit and scoped validation complete; canonical integration gates pending.
Branch: `rust-service-iteration-0017-signals` (recorded by coordinator checkout guard).
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0017-signals` (recorded checkout; command cwd is its `rust-service/` directory).
Base commit: `cc2abb85cefb3a29e9b7d75e62986dff83e75680` (assigned kickoff and recorded check-run HEAD).
Final commit: none; commits are prohibited for this delegate and belong to the coordinator.
Agent or owner: GitHub Copilot, signals workstream.
Model and tool version: unknown.
Instruction source: [signals instructions](instructions/signals.md) at the assigned kickoff, with [charter](../charter.md); instruction-file commit not independently verified.
Session or transcript reference: none retained in this report.
Started and finished: audit effort timestamps unknown; coordinator check ran from `1789847965169` to `1789847980337` Unix milliseconds on 2026-09-19.

The manifest records source commit `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`, distinct from the assigned kickoff.
Their ancestry and toolchain version are not established by the supplied check artifacts; checkout identity and start status are recorded below.
The initial delegate task probe lacked `tool_search`; the coordinator subsequently launched compound task `rs17-parallel-checks`.
No delegate task execution or autonomous scheduling is claimed.
This documentation finalization only reads reports and their own evidence, edits reports, and requests editor diagnostics.

## Outcome

Completed bounded source inspection of exactly two ranked boundaries: document/recipient routing isolation and slow-receiver failure isolation.
One test-only repair cluster adds a direct routing regression in the existing owning module.
No production behavior, public API, or contract was changed.
The routing coverage gap is supported by source inspection, not an observed runtime defect.
Coordinator task `process: rs17-signals-check` passed all six crate tests, Clippy, and workspace formatting.
The routing evidence-gap repair and unchanged slow-receiver policy have scoped passing evidence; final integration acceptance remains coordinator-owned.

## Hypothesis Results

Initial charter hypothesis: existing current contracts and focused tests may already discriminate the relay's consequential decisions.
Selection used the current [relay contract](../../../../crates/sea-signals/README.md#contract), [implementation and tests](../../../../crates/sea-signals/src/lib.rs), and [shared signal contracts](../../../../crates/sea-core/src/signals.rs), independently of historical finding lists.

For routing, the hypothesis is not supported by the pre-edit focused evidence for the complete selected boundary.
`isolated_rooms_limits_missing_target_and_drop` sends only to `missing` before observing an empty other-room queue: that assertion cannot distinguish correct room isolation from no delivery anywhere.
`broadcast_target_membership_and_no_replay` verifies broadcast with only one member, and does not verify the complete delivered submission.
The local falsifiable finding is therefore an owning-layer regression gap, not a new routing requirement or a demonstrated implementation fault.
The cheapest check is `tests::document_scoped_routing_preserves_recipients_and_envelopes`: two rooms contain the same sender and recipient identities, and each completed send must leave exactly the specified events in the specified queues.
Incorrect targeting, omission of a broadcast peer, cross-room delivery, or alteration of the sender/submission must fail its assertions.
The test checks both existing delivery policies with queues drained between submissions, without assuming best-effort transport ordering.

For slow-receiver failure isolation, source inspection supports the hypothesis within the selected policy boundary.
The existing `tests::best_effort_drops_but_reliable_overflow_fails_only_slow_receiver` fills a capacity-one queue with best-effort sends, consumes its retained message, overflows it reliably, checks `Lagged` and `Left`, then demonstrates continued sender use.
Changing the relay's `!best_effort` removal decision, terminal notification, or removal publication would fail this owning-module test.
The coordinator suite executed this named test successfully, supporting `already adequate` for this selected policy boundary only.

## Deliverables and Commits

Changed files, all inside assigned ownership:

- [rust-service/crates/sea-signals/src/lib.rs](../../../../crates/sea-signals/src/lib.rs): one new focused test, using existing connection and submission helpers.
- [rust-service/historical/iterations/0017/phase-2/signals.md](signals.md): this completed handoff report.

No other files, ignored outputs, dependencies, manifests, locks, shared contracts, or other worktrees were written by this delegate.
No commits were made.
This enumerates delegate edits, not an independently observed whole-worktree status.
No changeset is needed for test-only evidence and the audit report; there is no user-facing behavior or API change.

## Validation Evidence

Read both nonempty `result.json` and `output.log` in `/workspaces/FluidFramework-rust-service-iteration-0017-signals/rust-service/target/iteration-0017-evidence/signals-check-1789847965168-05639ec7-38c6-4172-abce-3274439dfeb1/`.
Run ID: `1789847965168-05639ec7-38c6-4172-abce-3274439dfeb1`; runner PID: `450349`; environment label: `signals`.
Runner start/end: `1789847965169` / `1789847980337` Unix milliseconds; elapsed: 15,168 ms; final exit: `0`.
The result and log agree on run identity, checkout, command starts, and final exit.
Per-command PIDs, finishes, and exits below come from the result; named test outcomes come from the log.

| Observed command | PID | Start / finish (Unix ms) | Exit / outcome |
| --- | --- | --- | --- |
| `cargo test -p sea-signals --all-features` | 450444 | 1789847965233 / 1789847976263 | 0; 6 passed, 0 failed; 0 doc-tests |
| `cargo clippy -p sea-signals --all-targets --all-features -- -D warnings` | 453302 | 1789847976264 / 1789847980012 | 0 |
| `cargo fmt --all -- --check` | 454355 | 1789847980012 / 1789847980337 | 0 |

All command cwd values are `/workspaces/FluidFramework-rust-service-iteration-0017-signals/rust-service`.
The checkout guard records branch `rust-service-iteration-0017-signals` and HEAD `cc2abb85cefb3a29e9b7d75e62986dff83e75680`.
Recorded start status lists only modified `rust-service/crates/sea-signals/src/lib.rs` and this report; no manifest or lockfile modification is listed.
The artifacts do not include a post-run status or explicit compiler-version/environment dump, so they do not establish those checks.
The log uses local `target/debug/deps` executables and names both `tests::document_scoped_routing_preserves_recipients_and_envelopes` and `tests::best_effort_drops_but_reliable_overflow_fails_only_slow_receiver` as `ok`.
The suite, not the originally requested exact filters, supplied this behavior evidence; no exact-filter run or mutation experiment is claimed.

The coordinator launched this check through compound task `rs17-parallel-checks` after the delegate probe lacked `tool_search`; the delegate executed no tasks.
Warnings-denied rustdoc (`RUSTDOCFLAGS='-D warnings' cargo doc -p sea-signals --all-features --no-deps`), `node scripts/check-documentation.mjs`, policy/record checks, and workspace canonical integration gates remain integration-owned and pending.
Zero doc-tests do not satisfy the rustdoc gate.
Editor diagnostics for this documentation-only finalization are a separate check, not Rust execution or link verification.

## Behavioral Contracts and Test Layers

### Two-Boundary Inventory

| Rank / boundary | Owner and consumers | Exact contract | Owning decision and discriminating test | Proposed disposition / revisit |
| --- | --- | --- | --- | --- |
| 1 / signals-document-recipient-isolation | `SignalConnection::send_signal` and `SignalRoom::dispatch`; document-bound `LocalSignalService::open_signals` consumers through `SeaSignals`, including local bindings and host composition described in the architecture | Relay README: "Each `SignalRoom` is one isolated routing domain"; "Broadcast includes the sender; targeted messages reach only a matching live member"; "A missing target is a successful no-op". Core `SignalMessage`: "sender identity bound by the relay, never trusted from its payload" and "Original routing, payload, and delivery mode". | Lock this connection's room membership, construct sender/submission, and select recipients with the target predicate. New `tests::document_scoped_routing_preserves_recipients_and_envelopes` verifies exact events plus empty nonrecipient queues with duplicate identities in independent rooms. | Test-only repair validated by the named passing test in the 6-test suite; integration acceptance pending. Revisit when routing or room ownership changes. |
| 2 / signals-slow-receiver-failure-isolation | `SignalRoom::dispatch` and `SignalConnection::next_signal`; senders and live consumers of `SeaSignals` | Relay README: "overflow terminates the slow receiver explicitly without blocking other recipients"; "Best-effort messages may be discarded when a receiver queue is full"; "Membership updates are always reliable and are never silently discarded". Core `Reliable`: "fail a receiver that cannot retain accepted messages". | Nonblocking `try_send`, reliable-only eviction, out-of-band `Lagged`, and reliable `Left` publication. Existing `tests::best_effort_drops_but_reliable_overflow_fails_only_slow_receiver` discriminates those decisions directly and demonstrates sender survival. | Already adequate for this selected policy: named test passed; no change. Integration acceptance pending. Revisit on dispatch/terminal changes or evidence of multi-recipient eviction defects. |

Routing ranks first because selecting the wrong document or recipient exposes application bytes outside the intended routing domain, and the previous isolation assertion has no live matching destination.
Slow-receiver policy ranks second because bounded queues couple delivery, eviction, membership updates, and continued service to other members.
Both are current responsibilities of the recently added relay; recent addition alone is not a defect claim.

Unselected candidates are initial-snapshot/registration lifetime, receive cancellation, and admission-size validation.
They rank lower for this bounded run because they have nearby dedicated assertions or simpler local validation decisions, while the selected boundaries govern recipient isolation and failure propagation.
This is a selection rationale, not an additional completed boundary audit or an exhaustive adequacy claim.

The new test uses the existing module's private receiver access to observe the completed local dispatch without sleeps, timeouts, network fixtures, or potentially hanging receives.
Exact `TryRecvError::Empty` assertions distinguish an empty live queue from a disconnected queue and catch duplicate delivery.
The second boundary retains its existing owner-local test; no additional comments or tests are needed for the stated policy check.
The existing README and shared types already promise the tested behavior, so no contract documentation changes are required.

No shared conformance test is relied on as proof of either owning decision.
Native composition, generated bindings, browser transport, and Fluid signal suites listed in the crate README exercise distinct transport/serialization/adapter responsibilities, but their historical results are not fresh validation here.
Neither selected boundary requires new platform behavior, a new guarantee about transport best effort, or a storage/archive assertion.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Execution limitation | Initial delegate task probe lacked `tool_search` | User-supplied scheduling provenance; attributable coordinator run above | No delegate task execution | Coordinator launched `rs17-parallel-checks`; signals check passed | Attribute coordinator execution accurately; no autonomous scheduling or tool fix was demonstrated. |
| Evidence gap | Existing room-isolation assertion follows a missing-target send | `isolated_rooms_limits_missing_target_and_drop` in the owning module | Empty other-room queue does not discriminate live-recipient routing isolation | One focused test-only repair; new routing test passed | Negative delivery assertions need a live matching control destination. |

No execution failures, repeated failed repair attempts, or substantial effort measurements were observed.
One optional directory lookup for `.github/instructions` returned absent; the applicable root instructions and linked guidelines were read directly.

## Contract and Integration Friction

No shared semantic or API change is proposed.
The relay requires an already-authorized document/identity from the host; room-isolation evidence must not be described as authentication evidence.
Only validation and eventual integration depend on the coordinator; no sibling implementation edits are required.
The overflow assessment does not establish a new promise that a receiver whose own queue fills with reliable departure notifications must survive recursive eviction.
Changing that policy would require a shared semantic decision and is outside this repair.

## Human Interventions

The user supplied the exact worktree, branch, kickoff, two-boundary/one-cluster budget, and file-only fallback after the early task-access failure.
This overrides the instructions' ordinary delegate task-probe prerequisite for this batch only.
No other intervention or scope approval was requested.

## Measurements

Performance, size, dependency, and throughput measurements: not applicable to this test-only repair; none collected.
Coordinator check elapsed time: 15,168 ms; 6 unit tests passed; process metadata is recorded above.
Audit effort, token use, model version, and exact toolchain version remain unknown.
Declared environment is a Debian 13 dev container; recorded execution environment label is `signals`.

## Proposed Decisions

No shared decision or new decision record is proposed.
Scoped evidence supports the repaired routing row and already-adequate slow-receiver row; final acceptance still depends on integration evidence.
Existing documentation already states the unchanged contracts; no production documentation addition is required for this test-only repair.
If validation exposes an implementation fault or ambiguous shared behavior, stop for review before any additional edit slice.

## Candidate Skills and Process Changes

The negative-delivery control lesson above is a candidate example for the existing quality skill's decision-discriminating evidence guidance, not a new skill or a proposed skill edit.
The existing coordination guidance already requires truthful blocked validation; no tool-isolation improvement was demonstrated here.

## Remaining Work and Risks

Coordinator must reconcile the two inventory rows, verify final changed-path/manifest/lock status, and complete warnings-denied rustdoc, documentation/record/policy checks, and canonical integration gates.
Compilation, six unit tests, Clippy, formatting, and run-start checkout identity are evidenced above; integration closure is not claimed.
The delegate remains within one test-only repair cluster; this finalization changes only the report.

Residual unreviewed cases include simultaneous admission/removal schedules, multi-recipient departure-overflow cascades, exact admission-limit edges, and full membership metadata snapshots.
Owner: signals maintainer/coordinator; revisit when the corresponding implementation changes, a consumer requirement appears, or a concrete failing case is supplied.
These are coverage limits, not findings of broken behavior.
Authentication, retention, production qualification, shared-core policy, transport/browser work, and ongoing Fluid integration are explicitly excluded.
No task evidence, temporary fixture, or generated artifact was created by the delegate; the coordinator produced the cited evidence.
The two declared edited files are the complete delegate handoff.
