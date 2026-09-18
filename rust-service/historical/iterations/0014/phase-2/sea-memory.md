# Iteration 0014: sea-memory Report

Status: complete
Branch: `rust-service-iteration-0014-sea-memory`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0014-sea-memory`
Base commit: `122e48a57007da96d4941f1630e7a709224e5296`
Final commit: report commit (this file); implementation commit `938bd2b6805`
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; tool version unknown
Instruction source: [`instructions/sea-memory.md`](instructions/sea-memory.md) at kickoff commit `122e48a57007da96d4941f1630e7a709224e5296`
Session or transcript reference: none
Started and finished: `2026-09-17`; exact times unknown

## Outcome

Audited the highest-risk `MemoryStream` boundaries against the `SeaStorage` contract, iteration `0013`, shared conformance, implementation control flow, and actual consumers. Added focused owning-crate tests for the inclusive upper read boundary and failed snapshot-publication atomicity. No production behavior, documentation, dependency, manifest, lockfile, shared contract, persistence format, or public API changed. Confidence is high for the selected boundaries because both focused tests and all seven crate tests pass under the required strict package gates.

## Hypothesis Results

- **Relied-upon contracts: supported.** `SeaStorage::read` documents events strictly after `after` through `through`, while `SeaStorage::publish_snapshot` promises atomic validation and conditional publication. The crate README already accurately describes finite readers, atomic load capture, and snapshot validation, so no documentation change was needed.
- **Localized regression evidence: supported.** Shared conformance checked the lower read boundary, finite capture, stale-parent/regression/operation conflicts, and successful idempotent retry, but did not isolate upper-bound inclusion or prove that missing-root rejection leaves snapshot history and operation resolution untouched. `read_includes_through_and_excludes_later_events` and `rejected_snapshot_does_not_bind_operation_identity` now cover those implementation decisions locally.
- **Proportionate repair: supported.** Two test-only clusters closed the selected gaps without changing semantics. After the second cluster, the budget stopping condition applied.
- **Convergence after iteration 0013: supported.** The prior report and current code showed adequate evidence for append/tree atomicity, finite and cancellable readers, load capture, position validation, content round trips, snapshot selection, and normal publication conflicts. Those boundaries were recorded without duplicate tests.

## Deliverables and Commits

- `938bd2b6805` (`test(sea-memory): cover range and snapshot atomicity`): two focused tests in `sea-memory`.
- Report commit (this file): completed audit, proposed inventory rows, validation, and blocker evidence.

## Validation Evidence

- Focused `cargo test -p sea-memory read_includes_through_and_excludes_later_events -- --exact --nocapture` passed: 1 passed, 0 failed.
- Focused `cargo test -p sea-memory rejected_snapshot_does_not_bind_operation_identity -- --exact --nocapture` passed: 1 passed, 0 failed.
- Post-recovery `cargo test -p sea-memory --lib current_tests -- --nocapture` passed all 7 tests: `append_accepts_nested_blob_tree`, `append_reports_memory_durability`, `passes_storage_conformance`, `put_directory_rejects_missing_child`, `read_includes_through_and_excludes_later_events`, `read_rejects_reversed_bounds`, and `rejected_snapshot_does_not_bind_operation_identity`.
- `cargo fmt --all -- --check` passed.
- `cargo clippy -p sea-memory --all-targets --all-features -- -D warnings` passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-memory --all-features --no-deps` passed.
- `cargo test -p sea-memory --all-targets --all-features` passed.
- `git diff --check` passed; `Cargo.lock` was unchanged from kickoff; changed paths were restricted to `rust-service/crates/sea-memory/src/lib.rs` and this report.
- `pnpm policy-check --path rust-service` did not pass. It reported an out-of-scope missing copyright header in `.github/skills/rust-service-quality-iteration/scripts/quality-inventory.mjs` and missing worktree-local `typescript` dependencies for `rust-service/tests/minimal-fluid-driver/package.json`. No owned file failed policy.
- `pnpm build:fast` was not run because the change is test-only under `#[cfg(test)]` and does not alter generated WASM inputs or production package output.
- No machine-readable artifact was required or retained.

## Behavioral Contracts and Test Layers

The changed crate is `sea-memory`; only its test module changed.

- **Read range:** `SeaStorage::read` owns the `(after, through]` contract. `read_includes_through_and_excludes_later_events` proves the memory backend's ordinal-to-slice conversion includes `through` and excludes later commits. Shared conformance separately proves lower-bound exclusion, empty-after-head behavior, finite capture, reader independence, cancellation, and committed-position validation.
- **Snapshot publication atomicity:** `SeaStorage::publish_snapshot` owns atomic root validation and conditional publication. `rejected_snapshot_does_not_bind_operation_identity` proves missing-root rejection changes neither retained history nor operation resolution and permits valid reuse of that identity. Shared conformance separately proves successful publication, exact retry idempotency, resolution, stale-parent conflict, regression rejection, operation-input conflict, and historical lookup.
- **Already adequate boundaries:** Shared conformance plus iteration `0013` local tests adequately cover append/tree validation, content round trips, nested directories, durability, finite load capture, snapshot selection, reversed ranges, and missing directory children. The mutex-scoped implementation directly supports atomic snapshot/head capture and publication mutation ordering. No duplicate local assertion was added.
- **Documentation:** `SeaStorage` and the crate README already state the relied-upon behavior accurately, so test-only repair was proportionate. Broader sequencer, generated binding, integration, and browser tests exercise composition rather than these two crate-owned index/rollback decisions.

Proposed quality-inventory rows:

| Boundary ID | Boundary | Risk and evidence | Disposition | Contract/test references | Revisit trigger |
| --- | --- | --- | --- | --- | --- |
| `sea-memory-read-range` | Read interval conversion and finite cap | Consumer-visible off-by-one risk; shared conformance omitted an explicit upper-bound assertion | repaired | `SeaStorage::read`; `read_includes_through_and_excludes_later_events`; shared storage conformance | Read-position representation or range contract changes |
| `sea-memory-snapshot-rejection-atomicity` | Failed snapshot validation and operation binding | A premature mutation could poison retries or expose rejected history | repaired | `SeaStorage::publish_snapshot`; `rejected_snapshot_does_not_bind_operation_identity`; shared storage conformance | Publication validation/order or operation-index storage changes |
| `sea-memory-load-capture` | Atomic snapshot, head, and finite tail capture | High concurrency consequence, but one mutex and `assert_captured_load` provide direct evidence | already adequate | crate README; `SeaStorage::load`; shared `assert_captured_load` | Load locking or stream materialization changes |
| `sea-memory-append-tree-atomicity` | Event/tree validation before append | High integrity consequence; shared rejection/head assertion and iteration `0013` recursive tests are sufficient | already adequate | `SeaStorage::append`; `reject_missing_event_tree`; `append_accepts_nested_blob_tree` | Tree validation or append mutation order changes |
| `sea-memory-reader-cancellation` | Dropped finite reader isolation | Moderate lifecycle risk; readers own cloned vectors and shared conformance drops one reader while another completes | already adequate | crate README; `storage_read_is_finite`; `storage_readers_are_independent_and_cancellable` | Read streams become live or borrow shared mutable state |

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Rejected exploration output | A delegated search named a nonexistent `sea-storage` crate and APIs absent from this checkout. | Direct guarded `rg` found the real trait in `sea-core/src/lib.rs` and implementation in `sea-memory/src/lib.rs`. | The summary was unusable as audit evidence. | Rejected and replaced with exact source reads. | Verify delegated symbol maps against one direct path before relying on their semantic summary. |
| Validation infrastructure | Shared terminal runs were interrupted or contaminated by sibling-worktree output; one delegated guard substituted the wrong expected branch. | Exit 130, mismatched prompt paths, and branch `sea-memory` instead of the literal assigned branch. | Delayed focused validation; no result from those runs was accepted. | Used literal guarded commands, unique target directories, exact changed-path assertions, and named tests. | Accept concurrent-worktree validation only when path, branch, HEAD, dirty paths, command, and named result align. |
| Tooling incident | A runner asked only to capture policy diagnostics executed `git reset --hard` at kickoff. | The two owned files became clean and their added symbols disappeared. | Erased uncommitted report/test edits; no pre-existing user changes were present. | Restored the exact patches, reran all seven tests and package gates, and recorded the incident. | Validation runners must never introduce checkout/reset commands; guard commands should fail in place. |

## Contract and Integration Friction

No shared API limitation or implementation dependency blocked the audit. The only integration friction is the repository policy failure outside this workstream's writable scope and missing worktree-local Node dependencies.

## Human Interventions

The user supplied the authoritative worktree, branch, kickoff commit, ownership boundary, and prohibition on external evaluator material. No mid-workstream semantic decision was required.

## Measurements

- Tests: 7 passed, 0 failed; 2 new focused tests and 5 retained tests including shared conformance.
- Implementation: 1 test module changed; no production behavior, dependencies, manifests, or lockfile changes.
- Performance, binary size, and retained artifact measurements: not applicable to test-only changes.
- Environment: Debian GNU/Linux 13 dev container; repository-pinned Rust toolchain; isolated Cargo target directories; exact model/tool version unavailable beyond GitHub Copilot.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

Candidate coordination hardening: delegated validation instructions should prohibit and mechanically reject checkout/reset/clean/restore commands, and acceptance should require literal path, branch, HEAD, dirty-path, command, and result markers. This is supported by both the wrong-worktree summaries and the destructive policy-diagnostics runner.

## Remaining Work and Risks

- The Phase 2 integrator should rerun canonical workspace validation and repository policy after combining workstreams. The policy failure above remains unresolved because both reported causes are outside this workstream's writable scope or are local dependency setup.
- Snapshot publication concurrency remains covered by mutex serialization and shared conflict/idempotency tests, not by a deterministic memory-specific race test; adding one would duplicate implementation mechanics without a distinct contract assertion.
- `IdentityExhausted` remains impractical to trigger through safe APIs, consistent with iteration `0013`; revisit only if identity allocation becomes injectable or representation changes.
- No temporary machine-readable artifacts or owned processes remain. Cargo target directories under `/tmp` are disposable validation output.
