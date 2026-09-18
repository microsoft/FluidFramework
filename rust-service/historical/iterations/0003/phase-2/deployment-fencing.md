# Iteration 0003: deployment-fencing Report

Status: complete
Branch: `rust-service-iteration-0003-deployment-fencing`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0003-deployment-fencing`
Base commit: `d568058d3e6857f5f5a4c65abdaa13ed416d7254`
Final commit: `38f73153c7bbc440bd8dc50ebc6acabde28fc6b3` (implementation); report completion is committed separately
Agent or owner: GitHub Copilot deployment-fencing agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: [`instructions/deployment-fencing.md`](instructions/deployment-fencing.md) at `d568058d3e6857f5f5a4c65abdaa13ed416d7254`
Session or transcript reference: none
Started and finished: 2026-09-12T15:48:21+00:00; 2026-09-12T15:56:37+00:00

## Outcome

Implemented a same-host deployment authority using a persisted big-endian `u64` epoch and the standard library's exclusive OS file lock. `AuthoritativeSequencer` now holds one authority guard continuously across epoch validation, canonical replay, protocol validation, and storage append. Independent child processes sharing the authority path and test log demonstrated serialized rotation, stale-owner rejection, replacement replay, lock release after process loss, ambiguous committed and not-committed recovery, and duplicate-submission deduplication. Confidence is high for the tested single-host, local-filesystem model and deliberately does not extend to distributed filesystems or writers that bypass the adapter.

## Hypothesis Results

Supported within the scoped failure model. The deterministic test paused the old child inside `SequencerStorage::append` after fence validation, confirmed a second file description received `TryLockError::WouldBlock`, started a replacement child, and confirmed rotation had not completed before explicit release. After release, the old append completed before epoch 2 was issued; the replacement replayed it and appended only the valid local-sequence-2 successor. Epoch-1 recovery was then rejected. Killing a child while it held epoch 2 released the OS lock, after which epoch 3 was issued and replay recovered both accepted submissions. Deployment-backed ambiguous committed/not-committed outcomes and an exact duplicate were reconciled without invalid or duplicate appends.

The hypothesis remains intentionally untested and unsupported across hosts, lock-file replacement, network filesystems with non-local lock semantics, or storage writers that do not acquire this authority. Under those conditions an atomic storage-side fenced append remains the missing primitive.

## Deliverables and Commits

- `38f73153c7bbc440bd8dc50ebc6acabde28fc6b3` `feat(rust-service): add deployment fencing authority`
- Standard-library deployment authority adapter with durable epoch issuance and explicit authority errors.
- Operation-scoped guard that serializes replay, valid-only protocol validation, and append.
- Deterministic child-process file-log harness covering rotation during append, stale ownership, process loss, replacement replay, ambiguity, and duplicate submission.
- This report completion commit follows the implementation commit.

## Validation Evidence

- Checkout identity for every accepted command: `/workspaces/FluidFramework-rust-service-iteration-0003-deployment-fencing`, branch `rust-service-iteration-0003-deployment-fencing`.
- `CARGO_TARGET_DIR=/tmp/fluid-target-deployment-fencing cargo test -p fluid-sequencer --all-features -- --nocapture`: passed; 7 passed, 0 failed, 1 ignored child entrypoint; doc tests 0 passed, 0 failed. `deployment_file_authority_fences_independent_processes` launched four children: old-owner, replacement, and stale-owner each reported 1 passed and 0 failed, while the crash-holder was deliberately killed after proving it held the authority lock.
- `CARGO_TARGET_DIR=/tmp/fluid-target-deployment-fencing cargo clippy -p fluid-sequencer --all-targets --all-features -- -D warnings`: passed with no warnings.
- `cargo fmt --all -- --check`: passed.
- `git diff --check`: passed.
- `git diff --exit-code d568058d3e6857f5f5a4c65abdaa13ed416d7254 -- rust-service/Cargo.lock`: passed; no lockfile change.
- Focused test `CARGO_TARGET_DIR=/tmp/fluid-target-deployment-fencing cargo test -p fluid-sequencer deployment_file_authority_fences_independent_processes -- --nocapture`: passed after the synchronization correction; parent 1 passed, child invocations 1 passed each.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Architecture finding | The inherited process fence acquired its read lock only around storage append; protocol validation used potentially stale local replay state before acquiring that lock. | Inspection of the original `submit`, `connect`, and `FencedStream::append` control flow. | Merely replacing `Arc<RwLock>` with a file lock would still permit validation under an incompatible ownership view. | Refactored to one operation guard spanning epoch check, canonical replay, validation, and append. | Fencing reviews must trace the lock boundary around semantic validation, not only the final write call. |
| Failed harness attempt | The replacement child initially constructed its authority adapter before emitting `rotation-attempted`; construction correctly blocked on the old lock, causing the old child's 10-second bounded wait to expire. | Focused test failed with the old child timing out on `release-old`, replacement rejecting local sequence 2, and the parent observing late `rotation-complete`. | One failed focused run; no production behavior change. | Moved the marker before adapter construction and reran the same focused test successfully. | Emit deterministic progress markers before any operation that may acquire or block on the authority. |
| Tooling interference | A shared terminal was still draining commands from sibling worktrees and twice returned unrelated output despite an explicit `cd`. | Output named `process-isolated-transport` and `process-crash-recovery`, not this checkout. | No files in those worktrees were edited by this workstream; one unrelated running test was interrupted before the terminal became idle. | Rejected all mismatched output and accepted validation only after output began with this worktree and branch. | Multi-worktree command runners should allocate an isolated terminal and make checkout identity part of accepted evidence. |

## Contract and Integration Friction

No shared crate or kernel API changed, and no dependency or lockfile update is required. The adapter remains payload-agnostic and wraps `SequencerStorage` rather than adding conditional append.

The authority is rigorous only when every sequencer process uses the same stable authority-file inode and every append to the paired storage is performed while holding its guard. Deleting or replacing the authority file can create a second lock domain. Direct storage writers can bypass fencing. OS advisory-lock behavior and epoch-file durability must be validated for the deployment filesystem; this experiment used one Debian Linux host and `/tmp` reported as `ext2/ext3`. Cross-host or unsuitable network-filesystem deployment requires a lease service or storage-integrated atomic fenced append.

## Human Interventions

None.

## Measurements

Environment: Debian GNU/Linux 13 container, `x86_64-unknown-linux-gnu`, `rustc 1.98.1 (48a229cea 2026-09-01)`, debug test profile, `/tmp` filesystem reported as `ext2/ext3`, unique target directory `/tmp/fluid-target-deployment-fencing`.

One full-suite debug run reported ownership handoff from explicit old-owner release through both child completions as 5.12395 ms, authority reacquisition after killing the lock holder as 220.191 us, and 16 sequential guarded durable appends (each including lock acquisition, full replay, validation, append, and `sync_data`) as 6.582314 ms total. These are single-run functional observations under a synthetic local workload, not benchmark results and not suitable for production capacity estimates.

Dependency delta: none. `Cargo.toml` and `Cargo.lock` unchanged. Implementation commit size: 722 insertions and 100 deletions in one crate source file, including the child-process harness.

## Proposed Decisions

No shared decision is proposed. Phase 3 should decide whether the explicitly same-host authority is sufficient for an initial deployment target or whether production requires a distributed lease/storage-integrated fenced append.

## Candidate Skills and Process Changes

- For cross-process lock tests, place progress markers immediately before potentially blocking construction/acquisition, use a marker from inside the protected operation to prove lock ownership, probe `try_lock` for `WouldBlock`, and bound every path/child wait with forced cleanup.
- For multi-worktree validation, reject command output unless it prints the expected absolute checkout and branch before results; use isolated terminals rather than a shared persistent shell.

## Remaining Work and Risks

- Integration should rerun workspace-level validation after combining workstreams; crate-local validation is complete.
- The same-host experiment does not establish correctness across hosts, network filesystems, authority-file replacement, administrator lock bypass, or direct writes to the underlying storage.
- Advisory locking serializes all replay/validation/appends and replay is currently full-log, so throughput degrades with log length; the 16-append observation is not a capacity claim.
- `issue_fence` remains a compatibility convenience that panics on deployment authority failure; deployment callers must use `try_issue_fence`.
- The ignored child entrypoint is intentional and is exercised only by `deployment_file_authority_fences_independent_processes`.
- Recommended Phase 3 question: accept this as a scoped single-host deployment option, or require an authority/storage primitive that atomically rejects stale epochs across hosts.
