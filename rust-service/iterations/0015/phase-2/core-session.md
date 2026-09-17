# Iteration 0015: core-session Report

Status: complete
Branch: `rust-service-iteration-0015-core-session`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0015-core-session`
Base commit: `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Final commit: implementation `2555c717f68`; report completion is the follow-up commit containing this document
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/core-session.md`](instructions/core-session.md) at `27bf6bde813606100a00bf180085e2a5ba3a0f08`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Independently challenged all ten inherited `sea-core`, `sea-conformance`, and
`sea-sequencer` boundaries against their actual owning decisions and nearest
tests. Eight dispositions had direct discriminating evidence. Two bundled
`already adequate` claims masked practical owning-layer gaps in
`sea-sequencer`: the complete `SessionError` classification mapping and the
promise that replacement and close release inactive minimum-reference pins.
Both gaps were repaired with focused tests in one implementation commit. The
explicit ambiguous-append deferral remains valid because its outcome requires a
shared cancellation and recovery contract rather than another settled-outcome
test. The two-cluster stopping condition was reached with no production,
contract, dependency, manifest, lockfile, or format change.

## Hypothesis Results

- **Owning-decision evidence: supported.** Topical session and error tests could
  pass while three local error mappings or either minimum-reference transition
  regressed. Focused tests now isolate those decisions.
- **Convergence: supported with qualification.** Eight inherited rows survived
  direct challenge without churn. Two evidence gaps justified narrow repairs;
  no new behavior defect was found.
- **Proportionate repair: supported.** Two deterministic tests in the owning
  module cover the material gaps without changing runtime behavior or shared
  semantics.

## Deliverables and Commits

1. `2555c717f68` (`test(sequencer): isolate inherited session guarantees`) adds
   `session_errors_preserve_caller_classifications` and
   `replacement_and_close_release_minimum_reference_pins`.
2. This report records all ten challenged inventory rows, validation, and
   residual risk in the follow-up report commit.

## Validation Evidence

- Guards confirmed the exact worktree, branch
  `rust-service-iteration-0015-core-session`, kickoff ancestry from
  `27bf6bde813606100a00bf180085e2a5ba3a0f08`, and owned paths.
- `cargo test -p sea-sequencer session::tests::session_errors_preserve_caller_classifications -- --exact`
  passed with 1 selected, 1 passed, and 0 failed.
- `CARGO_TARGET_DIR=/tmp/sea-core-session-0015-target cargo test -p sea-sequencer session::tests::replacement_and_close_release_minimum_reference_pins -- --exact`
  passed with 1 selected, 1 passed, and 0 failed.
- With the same isolated target directory, `cargo fmt --all -- --check`, strict
  Clippy for all three owned packages, warning-denied rustdoc for all three
  packages, and all-target/all-feature tests for all three packages passed.
  Both new tests were present in the passing package suite.
- `git diff --check` passed before the implementation commit. `Cargo.lock` was
  unchanged. The implementation diff contained only
  `rust-service/crates/sea-sequencer/src/session.rs`.
- No machine-readable output was required or retained.

Two non-isolated lifecycle-test attempts were externally interrupted during
compilation with exit 130 and no selected test; neither is accepted as evidence.
One commit-hook terminal result was contaminated by a sibling workloads
worktree and was rejected. Repository-aware status and log checks independently
confirmed this worktree was clean and contained `2555c717f68`.

## Behavioral Contracts and Test Layers

The changed production crate is `sea-sequencer`, although the change itself is
test-only. `SessionError::kind` owns local classification and wrapped-error
delegation. `SequencerState::authors`, `open_session`, and `close` own which
active references contribute to committed `minimum_reference` metadata. The
README already documents both behaviors, so no contract text changed.

Proposed quality inventory rows:

| Boundary | Exact owning decision and consumers | Nearest discriminating evidence | Disposition | Changed contract/tests | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| `sea-core/monitored-stream-map-progress` | `MappedMonitoredStream::progress` delegates to the source after `poll_next` lets the source advance, even when `map_data` fails; all decorators consume that source-relative cursor. | `mapped_progress_preserves_source_delivery_after_transformation_error` fails if mapped progress caches only successful transformed delivery. | already adequate | none | Mapping gains retry, filtering, or replacement semantics. |
| `sea-core/error-classification-contract` | `ErrorKind` owns the stable category vocabulary; each implementation owns variant mapping. Core has no variant-to-category decision to test. Sequencer mapping evidence was incomplete. | The enum and `ClassifiedError` contract define vocabulary; new `session_errors_preserve_caller_classifications` isolates every sequencer mapping arm and backend delegation. | repaired | Added focused sequencer classification test; no contract change. | Categories, retry decisions, or protocol representation change. |
| `sea-core/caller-value-invariants` | The three identity constructors reject empty bytes and preserve accepted bytes; `EventPosition` owns numeric order and big-endian round trips. All storage and session callers consume these values. | `caller_identities_preserve_nonempty_bytes_and_reject_empty_values` and `event_positions_use_canonical_ordered_bytes` directly call each constructor and codec. | already adequate | none | Parsing, limits, canonicalization, or position representation changes. |
| `sea-conformance/session-monitored-progress-accessor` | `run_sea_responsibility_observable_behavior` owns the shared law that `progress()` matches initial, yielded-progress, and delivered-data state for every adopter. | `local_session_matches_observable_behavior` invokes the suite; its accessor assertions fail if only local-session progress bookkeeping regresses. Other adopters run the same shared law. | already adequate | none | A monitored-stream implementation or mapping layer bypasses the suite. |
| `sea-conformance/session-fallen-behind-recovery` | `LocalSession::monitored_events` owns detection of broadcast lag, finite storage catch-up from `previous`, `FallenBehind`, and ordered recovery; thresholds are implementation-owned. | `configured_event_lag_reports_fallen_behind_and_recovers` forces a one-item channel to lag and asserts status plus both recovered positions. | already adequate | none | Another implementation exposes configurable lag or lacks owning coverage. |
| `sea-conformance/storage-fresh-state-and-atomic-load` | The conformance suite owns shared empty-state and captured-load laws; each backend owns synchronization and persistence. | `storage_starts_empty` observes every empty surface. `assert_captured_load` captures a head, appends afterward, and proves the finite tail excludes the later append for every backend adopter. | already adequate | none | Storage semantics change, a backend is added, or local evidence exposes a shared-law omission. |
| `sea-sequencer/snapshot-coordination-latest` | `LocalSession::publish_snapshot` must update both snapshot and coordination watch channels after storage accepts a direct publication. | `direct_snapshot_publication_updates_coordination_streams` subscribes before direct publication and awaits the same published value from coordination. | already adequate | none | Publication paths or coordination ownership change. |
| `sea-sequencer/monitored-load-progress` | The load initialization branch sets `previous` and `latest_known` from the selected snapshot before emitting snapshot and tail items. | `local_session_matches_observable_behavior`, specifically `assert_snapshot_load_progress`, selects a positioned snapshot and asserts caught-up progress equals its position. No other component can synthesize that local cursor. | already adequate | none | Cursor, progress, buffering, or snapshot selection changes. |
| `sea-sequencer/session-replay-and-lifecycle` | Retry lookup owns stable receipts; `open_session` replacement and `close` own active-author removal; replay owns restoration of accepted operations while clearing connection-scoped state. | Existing `local_sessions_retry_load_replace_and_recover` isolates retry, stale replacement, close, and recovered receipt. `recovery_revokes_connection_scoped_session_state` isolates replay cleanup. New `replacement_and_close_release_minimum_reference_pins` observes metadata after each author-map transition. | repaired | Added focused replacement/close minimum-reference test; no contract change. | Replay, identity, replacement, close, or recovery transitions change. |
| `sea-sequencer/ambiguous-append-resolution` | Backend append may commit before cancellation prevents acknowledgement; no selected contract currently tells callers whether or how to resolve that outcome. | Existing retry and recovery tests exercise settled returns only and cannot distinguish cancellation after backend commitment. | deferred | none | A shared ambiguous-append cancellation and resolution contract is selected. |

Focused tests own local cursor, classification, state-transition, and fan-out
decisions. Conformance tests own implementation-independent session and storage
laws. Integration, generated, and platform tests remain useful for transport and
runtime composition but are not needed to establish these local decisions.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified inherited disposition | Broad error-classification evidence did not exercise three local mappings or complete wrapped-error delegation. | Search found the mapping arms but no direct assertions for `Corrupt` or `Lagged`. | One material evidence gap. | Added a focused exhaustive mapping test. | Expand bundled error rows into one exact decision per mapping owner. |
| Falsified inherited disposition | Replacement and close were asserted behaviorally but their promised minimum-reference effect was unobserved. | README promise plus state mutation review; no test asserted post-transition metadata. | One material lifecycle evidence gap. | Added one test that observes metadata after replacement and close independently. | Test the promised downstream state effect, not merely successful transition calls. |
| Validation contention | Two focused runs exited 130 before selecting a test; commit output came from a sibling worktree. | Interrupted compiler output and mismatched absolute workload paths. | Delayed validation; no ambiguous output was accepted. | Used an isolated Cargo target and repository-aware Git checks. | Path, branch, selected-test count, and output provenance are part of validation evidence. |

## Contract and Integration Friction

Ambiguous append cancellation remains a shared semantic limitation and was not
changed. No cross-workstream dependency or undocumented exception affected the
two accepted repairs.

## Human Interventions

None.

## Measurements

- Audit scope: ten inherited boundaries; two repaired evidence gaps, seven
  already adequate rows, and one preserved deferral.
- Repair size: one owned Rust test module; two focused tests; no runtime,
  manifest, dependency, format, or lockfile change.
- Environment: Linux development container, repository-pinned Rust toolchain,
  isolated Cargo target under `/tmp` for contention-free validation.
- Performance, binary size, dependency, exact elapsed time, and token use: not
  applicable or unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

No new skill change is proposed. The strengthened exact-owning-decision rule
found both gaps, and existing worktree provenance guidance correctly rejected
interrupted and foreign output.

## Remaining Work and Risks

No owned implementation work remains. Integration should inspect
`2555c717f68`, reconcile the ten proposed rows into the iteration inventory, and
run workspace-level gates. Ambiguous append cancellation remains deferred until
a shared contract is selected. Confidence is high in the direct mappings and
focused tests; no temporary artifact is retained in the worktree.
