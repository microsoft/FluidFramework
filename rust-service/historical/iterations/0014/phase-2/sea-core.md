# Iteration 0014: sea-core Report

Status: complete
Branch: `rust-service-iteration-0014-sea-core`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-core`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: implementation and report completion are in the commit containing this report
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/sea-core.md`](instructions/sea-core.md) at `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Risk-ranked `sea-core` after iteration `0013`, prioritizing the monitored-stream API added after that audit.
One contract and focused-test gap was repaired: mapped streams now explicitly promise source-relative progress after a data transformation error, and a focused test protects the resume cursor.
Error classification and caller-created value invariants were already documented and proportionately tested, so no second repair cluster was justified.
Public semantics, dependencies, manifests, lockfiles, wire formats, and persistence formats are unchanged.
Confidence is high in the audit disposition and focused test behavior.

## Hypothesis Results

- **Relied-upon contracts: supported.** Compression, encryption, stateful compression, and sequencer consumers all use `map_monitored_stream`. The helper preserved source progress after mapper failure, but its contract did not state whether the failed transformation rewound the source cursor.
- **Localized regression evidence: supported.** The new monitored-stream wrappers had focused cursor tests but no owning-module evidence for mapper-failure progress. The added test distinguishes source delivery from successful transformation.
- **Proportionate repair: supported.** One documentation clarification and one deterministic unit test resolve the selected gap without changing implementation or shared semantics.
- **Convergence after prior audit: supported.** Iteration `0013` already covered every prior function and method, value validation, malformed directory input, and trait ownership. Reinspection retained those adequate results rather than duplicating them.

An initial hypothesis that mapped progress should advance only after successful transformation was rejected.
`rust-service/MONITORED_STREAM_PLAN.md` explicitly requires decorators to preserve progress unchanged while transforming only data items, and source delivery necessarily occurs before the mapper can fail.

## Deliverables and Commits

1. `rust-service/crates/sea-core/src/monitored_stream.rs`: clarified source-relative mapped progress and added `mapped_progress_preserves_source_delivery_after_transformation_error`.
2. This report: risk ranking, findings, proposed inventory rows, validation, and residual risk.
3. Ordered commits: the commit containing this report.

## Validation Evidence

- Initial checkout guard passed: exact worktree `/workspaces/FluidFramework-rust-service-iteration-0014-sea-core`, branch `rust-service-iteration-0014-sea-core`, HEAD `122e48a57007da96d4941f1630e7a709224e5296`, clean status.
- Before the final assertion was selected, `cargo test -p sea-core monitored_stream::tests::mapped_progress_advances_only_after_successful_data_transformation -- --exact` passed: 1 passed, 0 failed. This was a reversible probe and is not accepted as final contract evidence.
- Final focused check `cargo test -p sea-core monitored_stream::tests::mapped_progress_preserves_source_delivery_after_transformation_error -- --exact` passed after report completion: 1 passed, 0 failed.
- `cargo fmt --all -- --check` passed.
- `cargo clippy -p sea-core --all-targets --all-features -- -D warnings` passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --all-features --no-deps` passed.
- `cargo test -p sea-core --all-targets --all-features` passed: 11 passed, 0 failed.
- `git diff --check` passed.
- `Cargo.lock` was unchanged from the kickoff commit.
- Changed paths were limited to `rust-service/crates/sea-core/src/monitored_stream.rs` and this report.
- VS Code diagnostics reported no errors in the changed Rust source.
- No machine-readable output was retained.

Two attempted focused reruns were rejected because a shared persistent terminal emitted another worktree's guarded command and exited 130.
The accepted final commands used absolute paths after the contention cleared; foreign output is not validation evidence.

## Behavioral Contracts and Test Layers

### Proposed quality inventory rows

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sea-core/monitored-stream-map-progress` | `sea-core::map_monitored_stream`; compression, encryption, stateful compression, and sequencer decorators | Added after iteration `0013`; one shared wrapper serves fallible transforms in four crates | Mapping preserves source progress; a transformation failure does not rewind an already delivered source item | Focused core cursor tests; broader decorator and sequencer tests | Contract was ambiguous at mapper failure. Poll a positioned source through one successful and one failing transform, then inspect `previous`. | repaired | Clarified `MonitoredStreamProgress::previous` and both target-specific mapper docs; added `mapped_progress_preserves_source_delivery_after_transformation_error` | Focused and full package tests, Clippy, rustdoc, format | Revisit if mapping gains retry, filtering, or replacement semantics that no longer preserve source delivery one-for-one |
| `sea-core/error-classification-contract` | `ClassifiedError` and `ErrorKind`; storage, decorator, sequencer, and WebTransport implementations and callers | Stable categories cross crate and protocol boundaries | Core defines caller-visible categories; implementations retain details and own variant-to-category mapping | Focused implementation tests and shared storage conformance assertions; transport serializes classifications | Compare the core categories with implementation mappings and consumers. Mappings are implementation-owned, documented by variant names, and tested where behavior differs. | already adequate | none | Read-only mapping and consumer inspection; package validation | Revisit when adding a category, changing retry decisions, or changing protocol representation |
| `sea-core/caller-value-invariants` | `OperationId`, `AuthorId`, `SessionId`, and `EventPosition`; all session, storage, protocol, example, and benchmark consumers | Values cross storage and transport boundaries, but iteration `0013` repaired and audited them | Identity bytes are nonempty and preserved; event positions use canonical ordered bytes | Focused `identity_tests` and `event_tests`; persistence, protocol, conformance, and example coverage at distinct boundaries | Compare iteration `0013` evidence with current constructors and broad consumers. No contract or implementation change invalidated the focused evidence. | already adequate | none | Full package tests plus inherited iteration `0013` focused evidence | Revisit if parsing, size limits, canonicalization, or position representation changes |

The focused core test owns mapper cursor semantics.
Decorator tests continue to own compression, encryption, and stateful decoding failures; sequencer tests own archive progress production; conformance tests own implementation-independent storage classifications; protocol and browser tests own serialization and platform delivery.
These layers prove distinct responsibilities and no redundant assertion was added outside core.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | Proposed making mapped progress wait for successful transformation. | The focused probe passed, but `MONITORED_STREAM_PLAN.md` requires decorators to preserve source progress unchanged. | A private implementation change would have contradicted settled public semantics. | Reverted the probe; clarified and tested source-relative progress instead. | Check the design record when a generic wrapper can plausibly expose either source-relative or transformed-layer progress. |
| Validation contention | Shared terminal process groups emitted sea-file or sea-memory commands during three delegated or direct attempts. | Mismatched guarded paths/branches and exit 130 were visible in captured output. | Delayed final validation; no foreign output was accepted and no foreign path was edited. | Retried with absolute worktree and manifest paths after contention cleared. | Treat guard output as part of validation provenance and reject successful-looking output from a mismatched worktree. |

## Contract and Integration Friction

No shared API limitation or cross-workstream dependency remains.
The only friction was concurrent terminal ownership during validation; it did not affect repository state.

## Human Interventions

None.

## Measurements

- Audit scope: three consequential boundaries, with the monitored-stream mapper ranked first because it postdated iteration `0013` and has four cross-crate consumer groups.
- Repair size: one owned Rust source file plus this report; no dependency or manifest changes.
- Tests: 11 sea-core tests passed in the Linux development container using the pinned Rust toolchain.
- Performance, binary size, and dependency measurements: not applicable; no runtime algorithm or dependency changed.
- Effort timing and token use: unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

No new reusable skill change is proposed.
The existing coordination guidance to verify absolute path, branch, and commit correctly prevented foreign terminal output from being accepted.

## Remaining Work and Risks

No required implementation work remains.
The integrator must reconcile the three proposed inventory rows into `quality-inventory.md` and run workspace-level Phase 2 validation.
Mapped progress intentionally remains source-relative after transformation failure; consumers introducing retry or filtered delivery would trigger a fresh contract review.
