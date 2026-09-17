# Iteration 0013: sea-counter Report

Status: complete
Branch: `rust-service-iteration-0013-sea-counter`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0013-sea-counter`
Base commit: `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`
Final commit: `6e1079c43efd6841023122f91f7d9ea1937b140b` (implementation); the report-only commit is the commit containing this report and is reported to the coordinator because the document cannot self-reference its own hash
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model version unknown; tool version unknown
Instruction source: [`instructions/sea-counter.md`](instructions/sea-counter.md) at `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`
Session or transcript reference: none
Started and finished: started 2026-09-17 (exact time unknown); finished 2026-09-17T02:30:33Z

## Outcome

Audited all five original functions in `sea-counter`: session creation, delta submission, snapshot publication, recovery, and `main`.
The existing tests covered fixed-session setup, signed big-endian deltas, initial and later snapshots, snapshot-plus-tail recovery, and the executable's expected value.
Recovery's malformed-payload path was the first nontrivial uncovered behavior: it panicked while decoding any payload whose length was not eight bytes.

Added a documented fixed-width decoder, made recovery return a precise local error for malformed snapshot or delta bytes, added an end-to-end malformed-delta regression test, documented every private helper, and updated the README's behavior summary.
No production crate, public API, dependency, manifest, lockfile, generated file, wire format, or persistence format changed.
Confidence is high for the owned example behavior.

## Hypothesis Results

Initial hypothesis: the small example has a locally testable example-flow edge case or observable-output invariant that is not covered by tests, and a focused refactor or test can improve it without changing production crates or public APIs.
The cheap discriminating checks are a complete declaration and behavior inventory, existing package tests, and `cargo run -p sea-counter`.
Result: supported.
`recover` had an uncovered malformed-payload panic; `tests::rejects_malformed_delta` now verifies the exact error, while all prior recovery tests and the executable still pass.

## Deliverables and Commits

- `6e1079c43efd6841023122f91f7d9ea1937b140b` (`test(rust-service): validate sea-counter payloads`): decoder, recoverable malformed-length handling, focused test, helper documentation, and README update.
- This report-only finalization commit: completed audit and evidence record; its hash is supplied externally because a commit cannot contain its own hash.
- No retained machine-readable artifact or failing reproducer.

## Validation Evidence

- Checkout guard: `/workspaces/FluidFramework-rust-service-iteration-0013-sea-counter`, branch `rust-service-iteration-0013-sea-counter`, kickoff `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`; passed before implementation.
- `cargo fmt --all -- --check`: passed after applying one rustfmt-only line-wrap correction.
- `cargo clippy -p sea-counter --all-targets --all-features -- -D warnings`: passed.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`: sea-counter compiled cleanly, then the command failed outside ownership at `crates/sea-sequencer/src/session.rs:1229` because `client_selected_publishers_suppress_sea_selection_and_enforce_permissions` is 106 lines under the 100-line `clippy::too_many_lines` limit.
- `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`: passed; generated documentation for sea-counter and the workspace.
- `cargo build --workspace --all-targets`: passed.
- `cargo test -p sea-counter --all-targets`: passed, 3 tests: `rejects_malformed_delta`, `recovers_from_initial_snapshot`, and `recovers_only_events_after_later_snapshot`.
- `cargo test --workspace --all-targets --all-features`: passed; every workspace test binary completed with zero failures.
- `cargo run -p sea-counter`: passed and printed `recovered counter: 4`.
- `node scripts/check-documentation.mjs`: passed: 24 roots, 31 READMEs, 48 local links.
- `pnpm install --frozen-lockfile`: passed after the first policy attempt established that the isolated worktree lacked TypeScript dependencies; the lockfile was already current.
- `pnpm policy-check --path rust-service`: passed after the frozen install: 430 processed, 0 excluded, 430 total.
- `git diff --check`: passed.
- Scope check before the implementation commit showed only `rust-service/examples/sea-counter/README.md`, `rust-service/examples/sea-counter/src/main.rs`, and this report.
- Lockfile hashes remained `8345775868357b3244596c26897b58c9283e419bfb0eebcea0058791b6065f8b` for `rust-service/Cargo.lock` and `a3d0ce07fee0460b91260c1a434910750055df0ba880d08c30865efc0f69e7bb` for `pnpm-lock.yaml`, matching the pre-edit hashes.
- `pnpm build:fast` was not required: repository search found sea-counter only in the Rust workspace and documentation/iteration records, not as a registered pnpm package or declared build-task input.
- An initial `cargo test -p sea-counter rejects_malformed_delta -- --exact` selected zero tests because the exact name is module-qualified; that result was excluded, and the corrected focused command ran one test successfully before the full package test.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Tooling | Three shared synchronous command invocations returned output from other iteration worktrees despite absolute paths. | Returned paths named `sea-sequencer`, `sea-content-addressed`, and `sea-benchmarks`, not sea-counter. | Those outputs could not be accepted as workstream evidence. | Started dedicated persistent shells, guarded path/branch/HEAD, and used their terminal IDs for all accepted commands. | In concurrent worktree runs, bind validation to an isolated terminal ID and reject output whose compiled paths do not match the assigned worktree. |
| Validation blocker | Strict workspace Clippy failed in an unchanged crate. | `crates/sea-sequencer/src/session.rs:1229`, `clippy::too_many_lines`, 106/100. | The required workspace Clippy command is not green at this kickoff. | Package-scoped strict Clippy passed; no out-of-scope edit was made. Integration must resolve or supersede the sea-sequencer finding. | Preserve exact out-of-scope diagnostics and demonstrate that the owned package passes the same lint level. |
| Worktree setup | The first policy check could not load TypeScript from the isolated worktree. | `Cannot find module 'typescript'` for `rust-service/tests/minimal-fluid-driver`; exit 1. | Policy evidence was initially unavailable. | Ran `pnpm install --frozen-lockfile`, verified unchanged lock hashes, then reran policy successfully. | Isolated worktrees need a local frozen pnpm install before policy checks that inspect TypeScript packages. |

## Contract and Integration Friction

No production API or cross-workstream dependency was needed.
Integration friction is limited to the unchanged sea-sequencer strict-Clippy failure recorded above.

## Human Interventions

None.

## Measurements

- Change size: 2 implementation files, 49 insertions, 16 deletions in `6e1079c43efd6841023122f91f7d9ea1937b140b`.
- Tests: sea-counter increased from 2 to 3 tests; all 3 passed on the pinned workspace Rust toolchain in the Linux dev container.
- Dependencies and lockfiles: unchanged.
- Performance and artifact-size measurements: not applicable; this workstream changed example validation only.
- Elapsed effort and token usage: unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

Candidate coordination guidance: when concurrent workstreams cause terminal-output cross-wiring, require a dedicated persistent shell, record its terminal ID, and rerun checkout guards before accepting evidence.
The existing local frozen-install guidance was sufficient for the policy-check dependency issue; no skill change is proposed for that event.

## Remaining Work and Risks

- The example still treats a tree-backed snapshot root and underlying session/storage failures as impossible and panics through `panic!` or `expect`; changing those assumptions would broaden the example's error model and was intentionally deferred.
- Malformed snapshot bytes use the same tested decoder as malformed event bytes, but only the event path has a dedicated malformed-input integration test.
- Integration must rerun strict workspace Clippy after reconciling the sea-sequencer workstream.
- No intentional untracked artifact remains; `node_modules` and Rust build outputs are ignored worktree-local validation products.
