# Iteration 0011: fluid-service-quality Report

Status: complete
Branch: `rust-service-iteration-0011-fluid-service-quality`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0011-fluid-service-quality`
Base commit: `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Final commit: `bd5bd9af1529a3a63734884b19d95025be3607f9` (implementation); the report-only closeout commit is the branch tip containing this completed report
Agent or owner: GitHub Copilot implementation workstream agent
Model and tool version: GitHub Copilot; rustc 1.98.1 (48a229cea 2026-09-01); cargo 1.98.1 (797e8a9bc 2026-08-05)
Instruction source: [`instructions/fluid-service-quality.md`](instructions/fluid-service-quality.md) at `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Session or transcript reference: none
Started and finished: 2026-09-13; exact times unknown

## Outcome

Audited the owned FSP4 protocol, Fluid sequencer, and native service paths. Reproduced and fixed one private sequencer recovery defect: an ambiguous session-start append permanently left the sequencer in `RecoveryRequired`, even when the caller retried the identical connection and replay could determine whether the append committed. Added deterministic boundary tests and crate documentation for framing, append-free validation, retry recovery, document routing, subscription catch-up, lag, cursor validation, and cancellation. No wire encoding, request kind, public cross-crate contract, persistence implementation, or shared sequencing rule changed.

Confidence is high for the tested single-process and existing same-host fencing behavior. Cross-host fencing, transport cancellation mapping, and malformed network-stream framing remain outside this workstream's writable scope.

## Hypothesis Results

- Supported: protocol framing rejects every truncation of a representative submission frame, bytes outside its declared body, unconsumed bytes inside the body, malformed headers/discriminants, and configured-limit violations. Evidence: `tests::every_truncation_and_trailing_byte_is_rejected`, `tests::malformed_and_oversized_frames_are_rejected`, and `tests::field_and_record_limits_are_enforced`.
- Partially falsified, then fixed: sequencer validation already rejected stale sessions, local-order violations, stale/unknown references, and conflicting submission identities before append, and exact submission retries were append-free. An ambiguous session-start append could not be resolved or retried. The minimized regression failed with `RecoveryRequired`; retaining the pending private log entry and replaying it on an identical retry closed the gap. Evidence: `tests::ambiguous_session_start_can_retry_without_duplicate_append` failed 0/1 before the fix and passed 1/1 after it; `tests::identity_and_reference_failures_are_append_free` passed 1/1.
- Supported: service routing isolates document logs and projected subscriptions. Registration precedes catch-up reads, cursor reads recover from notification lag, cancellation is checked before pending delivery, and invalid future cursors are classified on first read. Evidence: existing subscription boundary/lag/cancellation tests plus `tests::projected_subscriptions_are_document_bound_and_validate_cursors` passed 1/1.

## Deliverables and Commits

- Protocol crate docs and exhaustive truncation/trailing-data regression coverage.
- Sequencer crate docs, append-free identity/reference tests, ambiguous session-start regression, and the minimal private recovery fix.
- Service crate docs and document-bound subscription/cursor validation coverage.
- This report with guarantee inventory, failed attempts, compatibility assessment, validation, and residual risks.
- `bd5bd9af1529a3a63734884b19d95025be3607f9` - `fix(rust-service): recover ambiguous session starts`
- Report-only closeout commit: the branch tip containing this report; returned to the coordinator with the workstream result.

## Validation Evidence

Guarantee-to-test inventory:

| Guarantee | Evidence |
| --- | --- |
| Frame/header/body bounds; malformed and trailing data | Existing `malformed_and_oversized_frames_are_rejected`, `field_and_record_limits_are_enforced`; new `every_truncation_and_trailing_byte_is_rejected` |
| Session lifecycle and reconnect | Existing `stale_client_reconnects_and_regenerates_submission`, `rejects_invalid_and_stale_sessions_before_append`; new ambiguous session-start retry regression |
| Reference validity and monotonicity | Existing stale-reference test; new append-free reused-session and unknown-reference assertions |
| Duplicate, ambiguous, and conflicting submissions | Existing committed/not-committed ambiguity and explicit-resolution tests; new exact-duplicate/conflict append-count assertions |
| Local sequence ordering | Existing duplicate/gap tests in sequencer and service lag test |
| Document routing | Existing two-document isolation; new document-bound projected subscription test |
| Subscription catch-up, lag, resume, and cancellation | Existing atomic boundary, lag/restart, and cancellation tests; new invalid-cursor classification test |

Observed focused commands:

- `cargo test -p fluid-sequencer tests::ambiguous_session_start_can_retry_without_duplicate_append -- --exact --nocapture`: before fix, 0 passed / 1 failed, panic from `RecoveryRequired`; after fix, 1 passed / 0 failed.
- `cargo test -p fluid-service-protocol tests::every_truncation_and_trailing_byte_is_rejected -- --exact --nocapture`: 1 passed / 0 failed.
- `cargo test -p fluid-sequencer tests::identity_and_reference_failures_are_append_free -- --exact --nocapture`: 1 passed / 0 failed.
- `cargo test -p fluid-native-service tests::projected_subscriptions_are_document_bound_and_validate_cursors -- --exact --nocapture`: 1 passed / 0 failed.
- `cargo fmt --all --check`: exit 0 after applying the formatter's one macro-layout change.
- `cargo clippy -p fluid-service-protocol --all-targets --all-features --no-deps -- -D warnings`: exit 0.
- `cargo clippy -p fluid-sequencer --all-targets --all-features --no-deps -- -D warnings`: exit 0.
- `cargo clippy -p fluid-native-service --all-targets --all-features --no-deps -- -D warnings`: exit 0.
- `cargo test -p fluid-service-protocol --all-features -q`: 9 passed / 0 failed / 0 ignored; doc-tests 0.
- `cargo test -p fluid-sequencer --all-features -q`: 13 passed / 0 failed / 1 ignored; the ignored process worker was launched by the parent test in three child invocations and each passed; doc-tests 0.
- `cargo test -p fluid-native-service --all-features`: 14 passed / 0 failed / 0 ignored; doc-tests 0.
- `git diff --check`: exit 0.
- Changed-path audit: only `crates/protocol/src/lib.rs`, `crates/fluid-sequencer/src/lib.rs`, `crates/service/src/lib.rs`, and this report.
- Protected-file audit: no `Cargo.toml`, `package.json`, root lockfile, or `rust-service/Cargo.lock` changes.
- VS Code diagnostics for all three edited `lib.rs` files: no errors.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0011 phase-2`: exit 1 because the iteration manifest remains `active` and the five sibling workstream reports plus `integration.md` retain required markers. This completed report was not identified as invalid; the iteration-wide gate is correctly deferred to integration.
- Post-closeout clean status is checked immediately after the report commit.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Tooling | A delegated read-only inspection ignored the requested absolute worktree and ran in the `transformation-wrappers-quality` sibling. | It reported branch `rust-service-iteration-0011-transformation-wrappers-quality` at the same kickoff commit and found none of the requested paths. | No evidence from that command was accepted. | Re-ran checkout identity with explicit `git -C /workspaces/FluidFramework-rust-service-iteration-0011-fluid-service-quality`; target branch and clean status were verified. | In multi-worktree delegated commands, use absolute `git -C` guards and reject output whose printed checkout identity differs. |
| Defect | Injected an ambiguous result for a session-start append, then retried the identical `connect`. | The focused test ran once and failed with `called Result::unwrap() on an Err value: RecoveryRequired`. | A transient ambiguous connect could permanently wedge that sequencer instance; callers had no session-start resolution API. | Retain the pending private session-start entry, replay under the same fence on an identical retry, return success if replay finds it, or retry once if replay proves it absent. Focused test now passes both committed and not-committed ambiguity cases. | Ambiguous recovery must cover administrative entries as well as user submissions; test both possible storage outcomes. |
| Failed check | The first exact regression command used an unqualified test name. | Cargo reported `running 0 tests` with all tests filtered out. | The apparent success was invalid. | Re-ran with `tests::ambiguous_session_start_can_retry_without_duplicate_append`; it reproduced the defect. | For Rust unit tests with `--exact`, include the module-qualified test name and require a nonzero running count. |
| Tooling | Combined baseline and three strict Clippy attempts were interrupted or contaminated by concurrent sibling-worktree terminal activity. | Exit 130 during dependency compilation, or output naming another worktree/crate; no lint diagnostics were produced. | Those runs are not accepted as validation evidence. | Used a unique target directory and package-scoped `--no-deps` checks, recording only commands whose identity and result were attributable. | Shared terminal state is not trustworthy under concurrent workstreams; pair isolated targets with printed checkout identity and reject mismatched output. |

## Contract and Integration Friction

`OpenSubmissionStream` is intentionally transport-owned: the WebTransport adapter binds the stream to one document and rejects submissions carrying another document before forwarding to `NativeService`. The service's unary handler therefore rejects this request kind. Changing that division or cancellation's transport error mapping would require wrapper ownership and was not needed for the reproduced defect.

The broader combined Clippy command also selected `fluid-webtransport-native` and found a pre-existing `clippy::manual_let_else` warning at `crates/wrappers/webtransport-native/src/lib.rs:480`. That path is read-only for this workstream. The three owned packages pass strict package-scoped Clippy; the wrapper warning is escalated to its owner/integration rather than changed here.

No shared API, wire compatibility, sequencing semantic, root manifest, or lockfile change is proposed.

## Human Interventions

None.

## Measurements

Performance and persisted-size measurements are not applicable to this correctness/docs workstream. Dependency count changed by 0; public API count changed by 0; wire kind/encoding changes: 0. Environment: Debian GNU/Linux 13, rustc 1.98.1, cargo 1.98.1. Elapsed time and token use: unknown.

## Proposed Decisions

No shared decision is proposed. The fix is private state/recovery logic preserving existing accepted semantics.

## Candidate Skills and Process Changes

- Candidate coordination guidance: require delegated command evidence to include absolute worktree, full branch, selected-test count, and exit status; reject zero-test exact-filter runs and output from a different checkout.
- Candidate recovery audit pattern: for every appendable canonical entry type, inject both ambiguous-committed and ambiguous-not-committed outcomes and prove bounded replay/retry behavior.

## Remaining Work and Risks

- No owned implementation or validation work remains.
- Residual risk: same-host file locking is covered by existing process tests; cross-host authority is outside this service's guarantee. Transport-level malformed-stream and cancellation behavior belongs to wrapper workstreams.
- Integration must account for the escalated read-only `fluid-webtransport-native` Clippy warning if it runs workspace-wide strict Clippy with Rust 1.98.1.
- The iteration-wide Phase 2 record gate remains blocked on the active manifest, sibling reports, and `integration.md`; this workstream report has no unresolved required markers.
