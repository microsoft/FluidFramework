# Iteration 0013: sea-content-addressed Report

Status: complete
Branch: `rust-service-iteration-0013-sea-content-addressed`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0013-sea-content-addressed`
Base commit: `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`
Final commit: this report-only commit; its hash is reported to the coordinator because a commit cannot contain its own hash
Agent or owner: GitHub Copilot
Model and tool version: unknown
Instruction source: [`instructions/sea-content-addressed.md`](instructions/sea-content-addressed.md) at `cf77b2b3655dc5ae2e015ee4b789e301a9e2f200`; its recorded iteration source commit is stale (`52ad0aa3b4b28498e609d3fe41d9eabcf5f23bd2`), so the guarded worktree kickoff is authoritative.
Session or transcript reference: none
Started and finished: 2026-09-17; exact times unknown

## Outcome

Audited every function and method in `sea-content-addressed` and made one local persistence correctness fix.
Publication now verifies existing content and uses an atomic no-replace hard link instead of a rename that could replace a concurrently published object on Unix.
Added focused coverage for deduplication conflicts, missing objects, and directory limits and corruption; updated crate documentation to describe implemented behavior and use the README as crate-level rustdoc.
Confidence is high for the changed local behavior based on the reproducer and the complete crate test suite.

## Hypothesis Results

Supported: `publish` reported successful deduplication for a corrupt pre-existing object because it checked only path existence.
The initial `publication_rejects_conflicting_existing_content` reproducer failed because `publish` returned `Ok(())`; after the repair, `publication_verifies_existing_content` passes and confirms both identical deduplication and rejection without replacement.
Inspection also confirmed that rename-based publication could replace a target won by another publisher on Unix.
The repair verifies existing bytes and uses no-replace hard-link publication without changing object paths or encodings.

Function and method inventory:

- `StoreConfig::default`, `ContentStore::open`, `put_blob`, `get_blob`, `put_directory`, and `get_directory` are exercised by round-trip and focused error-path tests.
- `publish` and `verify_existing` are directly covered by identical and conflicting existing-content cases.
- `read_bounded`, `sync_directory`, and `hex` are exercised through public store operations.
- `ContentStore::root` is a trivial accessor and does not warrant a dedicated test.

## Deliverables and Commits

1. `a86986d1a7274c92e1d2bea65a286b9fd6126433` - `fix(sea-content-addressed): verify immutable publication`
2. This report-only commit - final audit and evidence

No persistence format, public API, dependency, manifest, lockfile, or generated-file change was made.

## Validation Evidence

- `cargo test -p sea-content-addressed publication_rejects_conflicting_existing_content` - failed before the fix because conflicting existing bytes were accepted; this was the intended reproducer.
- `cargo test -p sea-content-addressed publication_rejects_conflicting_existing_content` - passed immediately after the production repair.
- `cargo test -p sea-content-addressed --all-targets --all-features` - passed, 5 tests.
- `cargo fmt --all -- --check` - passed.
- `cargo clippy -p sea-content-addressed --all-targets --all-features -- -D warnings` - passed.
- `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-content-addressed --all-features --no-deps` - passed after both documentation edits.
- `node scripts/check-documentation.mjs` - passed after both documentation edits; final run checked 24 roots, 31 READMEs, and 48 local links.
- `git diff --check` - passed before the implementation commit.
- Path-qualified status and diff checks showed only the two owned crate files and this report changed; `rust-service/Cargo.lock` was unchanged and no root lockfile exists in this checkout.
- VS Code diagnostics reported no errors in `src/lib.rs`.
- `pnpm policy-check --path rust-service` could not start because the isolated worktree has no `node_modules` (exit 130).
- `/workspaces/FluidFramework/node_modules/.bin/flub check policy --path rust-service` started but could not load `typescript` while checking `rust-service/tests/minimal-fluid-driver/package.json` (exit 1); it reported no finding in `sea-content-addressed`.
- No machine-readable artifact was required or retained.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Product defect | Pre-seeded an identity target with conflicting bytes, then called `publish`. | The focused test failed because `publish` returned `Ok(())`. | Corrupt content could be acknowledged as deduplicated; rename also allowed concurrent replacement on Unix. | Fixed in `a86986d1a7274c92e1d2bea65a286b9fd6126433`; retained passing regression coverage. | Content-addressed deduplication must compare bytes, and publication must use a no-replace primitive. |
| Validation environment | Ran the required policy check in an isolated worktree without installed Node dependencies, then retried with the main checkout's `flub`. | Exit 130 for missing `node_modules`; retry exited 1 because `typescript` could not be resolved for an unrelated package. | The repository policy gate is inconclusive for this worktree. | No dependency workaround was retained; rerun at integration in a dependency-ready checkout. | Policy tools that resolve target-worktree modules need a local install, not only an external executable. |
| Coordination tooling | Initial delegated and shared-terminal guards returned sibling-worktree context. | Reported branches included `sea-file-durable`, `sea-counter`, and `sea-sequencer`. | Those outputs were rejected as evidence. | Used absolute file paths and path-qualified Git commands; guarded validation later confirmed the assigned branch and kickoff ancestry. | Multi-worktree evidence must include and enforce the absolute checkout identity. |

## Contract and Integration Friction

No shared API or cross-workstream dependency was changed.
Repository policy validation requires a dependency-ready integration checkout.

## Human Interventions

None.

## Measurements

Performance: not applicable; no benchmark was required for this correctness and documentation change.
Dependencies: unchanged.
Tests: increased from 2 to 5; all 5 pass under the pinned Rust toolchain in the assigned dev container.
Effort and token measurements: unknown.

## Proposed Decisions

No shared decision is proposed.

## Candidate Skills and Process Changes

No new process change is proposed; the existing coordination requirement for path-qualified, guarded commands correctly addresses the observed sibling-worktree interference.

## Remaining Work and Risks

- Rerun `pnpm policy-check --path rust-service` in the dependency-ready integration checkout.
- Interrupted publication can leave temporary files; startup cleanup would require a deliberate persistence policy.
- Temporary names use a process-local counter and can collide across processes; changing naming or retry behavior deserves a separate multi-process design and test.
- Failures after the hard link becomes visible are not classified as ambiguous by the current public error API.
- Recursively verifying referenced directory children, garbage collection, and synchronizing the parent when initially creating the store root are architectural follow-up work outside this assignment.
- No failing or ignored reproducer, temporary symlink, dependency installation, or generated artifact remains.
