# Iteration 0002: authoritative-sequencer Report

Status: complete
Branch: `rust-service-iteration-0002-authoritative-sequencer`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0002-authoritative-sequencer`
Base commit: `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Final commit: report completion commit containing this file; its self-referential hash is reported by the coordinator and in the final response
Agent or owner: GitHub Copilot authoritative Fluid sequencer agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [authoritative-sequencer instructions](instructions/authoritative-sequencer.md) at kickoff commit `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Session or transcript reference: none
Started and finished: `2026-09-12T15:09:47Z`; `2026-09-12T15:20:11Z`

## Outcome

Replaced the projection-only spike with an `FSQ2` valid-only authoritative sequencing experiment. Canonical records now include durable session starts and accepted submissions carrying writer, session, stable submission identity, writer-local order, opaque reference token, and payload. `AuthoritativeSequencer` replays canonical state, rejects invalid submissions before append, durably replaces a stale session on reconnect, and returns protocol acceptance only after storage append succeeds. `KernelStream` adapts `AppendStream + PositionCodec` without changing the kernel.

`FencedStream` supplies the experiment's single-authority boundary. A shared read/write gate holds the current fence through append, so issuing a new fence waits for any prior append and all later calls from the old owner fail before storage. Ambiguous submission responses poison further writes until finite replay finds the submission identity or proves it absent; committed outcomes return the recovered acceptance, while absent outcomes return the original submission for an identity-preserving retry. Exact duplicates return the original acceptance without append, and conflicting reuse of an identity is rejected.

Confidence is high for the deterministic valid-only, reconnect, deduplication, ambiguity, and process-shared fencing traces. Confidence is medium for production failover because integration must replace or contain the experiment's process-local fence gate with a deployment-backed exclusive lease having the same check-through-append property.

## Hypothesis Results

Initial hypothesis: a service that holds an explicit fencing lease can replay accepted frames, validate a submission without mutating storage, append a frame carrying a stable submission identity, and apply it exactly once. Replay after an ambiguous append can distinguish committed from not committed; a new fenced owner can recover the same state, while stale owners reject before append. This should preserve a valid-only canonical stream without kernel conditional append.

Cheapest disproof: focused deterministic tests where stale-reference, writer gap, or duplicate input increases stored frame count; fencing loss permits an append; replay of an ambiguous committed outcome duplicates acceptance; replay of an ambiguous not-committed outcome loses a later regenerated submission; or failover accepts two successors from one predecessor.

Planned checks: `cargo test -p fluid-sequencer --all-features` with named coverage for valid-only rejection, reconnect/new-session regeneration, fencing loss and failover replay, ambiguous committed/not-committed recovery, and submission deduplication; strict Clippy and formatting; unchanged `rust-service/Cargo.lock` against kickoff SHA-256 `0916282ad5de404a861b12779b95766106ca1edafbd8b9c984367405ad609437`.

The hypothesis was supported within the explicit fencing model. `invalid_submissions_are_rejected_before_storage` leaves storage unchanged for duplicate local order and gaps. `stale_client_reconnects_and_regenerates_submission` leaves storage unchanged on stale reference, rejects the replaced session, and accepts a regenerated local-sequence-one submission under a fresh session. `fencing_loss_rejects_old_owner_and_failover_replays` prevents the old owner from appending after fence rotation and lets the replacement replay and append the sole successor. The two ambiguity tests distinguish committed from not committed by replay and neither lose nor duplicate acceptance. `reused_submission_identity_with_different_content_is_rejected` closes identity aliasing.

No conditional append was required. That conclusion depends on one shared fencing authority serializing lease rotation with append; this experiment does not claim that two independent process-local gates provide distributed fencing.

## Deliverables and Commits

- `b84c3429efeec44a7c648da453eb171e5d66b696` - `feat(rust-service): add authoritative Fluid sequencer`.
- `FSQ2` canonical session/submission framing and deterministic replay.
- `SequencerStorage` boundary plus `KernelStream` adapter over `AppendStream + PositionCodec`.
- Explicit fenced append gate, reconnect/new-session replacement, stable submission identity, ambiguity recovery, and deduplication.
- Six focused tests spanning every requested trace.
- This report completion commit, listed by hash in the final response because a commit cannot contain its own hash.

## Validation Evidence

- Checkout identity: `/workspaces/FluidFramework-rust-service-iteration-0002-authoritative-sequencer`, branch `rust-service-iteration-0002-authoritative-sequencer`, kickoff `d04c7aa44eb8720fee2242d98729e6916c0dcb02`.
- `cargo test -p fluid-sequencer --all-features` with isolated `CARGO_TARGET_DIR=/tmp/ff-authoritative-sequencer-target` - passed: 6 unit tests, 0 failures; 0 doc tests.
- Passing tests: `invalid_submissions_are_rejected_before_storage`, `stale_client_reconnects_and_regenerates_submission`, `fencing_loss_rejects_old_owner_and_failover_replays`, `ambiguous_committed_append_is_recovered_and_deduplicated`, `ambiguous_not_committed_append_can_retry_same_identity`, and `reused_submission_identity_with_different_content_is_rejected`.
- `cargo fmt --all -- --check` - passed.
- `cargo clippy -p fluid-sequencer --all-targets --all-features -- -D warnings` with the isolated target - passed with no diagnostics.
- `git diff --exit-code d04c7aa44eb8720fee2242d98729e6916c0dcb02 -- rust-service/Cargo.lock` - exit 0. Final SHA-256 remained `0916282ad5de404a861b12779b95766106ca1edafbd8b9c984367405ad609437`.
- `git diff --check` - passed. Before the implementation commit, changed paths were only `rust-service/crates/fluid-sequencer/src/lib.rs` and this report.
- Integration workspace validation is intentionally deferred to the integration branch as assigned.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Human intervention / provenance | Generated instructions name iteration source `57b0028ff9061087b522c8dd652ca9b8b2179e50`; the user supplied actual kickoff `d04c7aa44eb8720fee2242d98729e6916c0dcb02` and hyphenated branch. | Initial `pwd`, `git branch --show-current`, `git rev-parse HEAD`, clean status, and lock hash all matched the user-supplied checkout. | Instruction provenance was stale for the actual dispatched worktree. | Recorded observed kickoff and branch before implementation; left the read-only instruction unchanged. | Workstream reports, not generated source fields, must capture actual dispatch provenance before edits. |
| Validation tooling incident | The first delegated package test silently ran in the `reference-model-faults` worktree and was interrupted; later shared-terminal output was interleaved with other workstreams. | The unusable run printed the wrong path/branch and exited 130. Correct direct runs printed the authoritative checkout and later used `/tmp/ff-authoritative-sequencer-target`. | No result from the first run was accepted; validation consumed extra effort. | Re-ran every required check with checkout markers and an isolated target directory. | In multi-worktree parallel execution, retain checkout identity and isolate Cargo targets; reject output whose identity marker does not match. |
| Ownership / dependency correction | The first implementation used workspace `futures-util`, `tokio`, `async-trait`, and `thiserror`, causing Cargo to rewrite the `fluid-sequencer` package dependencies in the shared lockfile. | Lock SHA changed from `091628...9437` to `0819fa...fe80`; kickoff diff showed only the generated dependency list. | Violated the explicit immutable-lockfile constraint despite all dependencies already existing elsewhere in the workspace. | Removed all added dependencies, restored the exact lock bytes, introduced `SequencerStorage` plus `KernelStream`, and used standard-library futures/locking in tests. Final lock diff is empty. | When a crate cannot own the workspace lockfile, adding even an already-resolved workspace dependency changes its package entry; design against existing direct dependencies or validate in a disposable copy. |
| Hypothesis supported | Exercised stale/invalid rejection, reconnect/regeneration, fence rotation/failover, ambiguous committed/not-committed outcomes, and deduplication. | All six focused tests passed under strict Clippy and unchanged lockfile. | No kernel conditional append or shared API change was needed for the scoped experiment. | Keep fencing and submission identity in the service layer; require integration to supply deployment-backed exclusive fencing. | Separate protocol acceptance from storage ambiguity and block successors until replay resolves uncertainty. |

## Contract and Integration Friction

- `KernelStream` requires the `PositionCodec` capability selected in Decision 0005. Integration must wrap a concrete stream that implements both `AppendStream` and `PositionCodec`; no core change is needed.
- Production integration must provide one shared fencing authority whose lease check remains exclusive through append. The included `FencedStream` proves this property for instances sharing one in-process gate; independently constructed gates are not a distributed fencing mechanism.
- Session-start append ambiguity marks the service recovery-required. The smallest current recovery path is constructing a replacement with `AuthoritativeSequencer::recover`; submission ambiguity additionally has `resolve_ambiguous` because its stable identity supports a client-facing committed/not-committed answer.
- `KernelStream::read_all` intentionally uses the kernel's finite-read contract and replays from the retained beginning. Checkpointing and retention-aware recovery remain deferred.
- Deli precedent: `server/routerlicious/packages/lambdas/src/deli/lambda.ts` drops duplicates, nacks gaps, nonexistent clients, and references below minimum before producing accepted sequence output; `clientSeqManager.ts` tracks client-local and minimum reference state. This experiment mirrors those validation classes while making valid-only storage explicit.
- PendingStateManager precedent: `packages/runtime/container-runtime/src/pendingStateManager.ts` replays unacknowledged batches only after connection state changes, asserts against replay under the same client ID, preserves batch identity, and expects nacked read-connection replay to reconnect on a write connection. This experiment similarly requires a fresh session and regenerated submission after stale rejection, while stable submission identity is reserved for ambiguity reconciliation rather than reuse across changed content.

## Human Interventions

The user supplied the actual worktree, hyphenated branch, kickoff commit, strict writable paths, and the requirement to commit implementation before the completed report. No mid-implementation semantic correction or additional human decision was required.

## Measurements

- Source: 1,310 lines in `src/lib.rs`; implementation commit changed one file with 1,067 insertions and 375 deletions relative to the projection spike.
- Tests: 6 unit tests completed in 0.00 seconds in the retained Cargo output; performance benchmarking was not applicable to this semantic experiment.
- Dependencies: unchanged direct dependencies (`bytes` and local `snapshotted-stream-core`); no manifest or lockfile delta.
- Persisted format: `FSQ2` length-prefixed binary records; persisted-size benchmarking and compatibility migration from the non-authoritative `FSQ1` spike are not applicable because the prior format was feasibility-only.
- Environment: Rust/Cargo 1.98.1, Debian GNU/Linux 13, Linux 6.8.0-1064-azure x86_64. Effort and token measurements: unknown.

## Proposed Decisions

No new shared decision is proposed. The implementation follows [Decision 0004](../../../decisions/0004-authoritative-fluid-sequencer.md) and found no irreducible need for kernel conditional append under an explicit exclusive fencing authority.

## Candidate Skills and Process Changes

Add a multi-worktree validation guard to the coordination workflow: every delegated command must print and verify absolute checkout plus branch before execution, use a workstream-specific `CARGO_TARGET_DIR` when concurrent builds are active, and discard results with mismatched identity. Also check whether a crate manifest change rewrites its `Cargo.lock` package dependency list before adding workspace dependencies outside lockfile ownership.

## Remaining Work and Risks

- Integration must cherry-pick `b84c3429efeec44a7c648da453eb171e5d66b696` and the report commit, then run `cargo test --workspace --all-targets --all-features` after all workstreams land.
- A production deployment must bind `FencedStream` semantics to a shared lease or single-writer authority across processes. If no mechanism can hold exclusivity from fence validation through append, the minimized missing capability is an atomic fenced append (`append(fence_epoch, bytes)` rejected when the durable epoch differs), not payload-aware conditional append.
- Full acknowledgement transport, durable checkpoints, retention-aware replay, session eviction, and batched Fluid operations remain outside this experiment.
- Protocol acceptance timing is exact: `SubmitOutcome::Accepted` is emitted only after successful storage append and local application; `StorageAmbiguous` is not acceptance and blocks successors; `RecoveryOutcome::Committed` becomes acceptance only after replay finds the identity; `NotCommitted` authorizes retry of the unchanged submission identity; `Duplicate` returns the prior acceptance without storage.
- Confidence is high for the deterministic test model and medium for deployment fencing until an integration supplies and fault-tests a cross-process authority.
