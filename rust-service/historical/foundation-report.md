# Foundation Phase Report

Status: complete
Source commit: `b674fd9730af`
Started: 2026-09-12
Completed: 2026-09-12
Coordinator: interactive user and GitHub Copilot

## Purpose and Scope

Phase 1 will create the compilable Rust workspace, settle only the semantics needed by the first public traits, establish the in-memory reference and conformance path, and encode crate dependencies for iteration `0001`. It will not attempt production durability, complete Fluid integration, or a stable public API.

## Initial Hypotheses and Checks

- A small pair of append-stream and snapshot-store traits can express the counter recovery path without Fluid-specific metadata. The cheapest check is a compiling in-memory implementation and counter example using only public traits.
- Opaque positions can support replay, stale-position detection, and snapshot recovery without exposing arithmetic. The cheapest check is an implementation-independent conformance test using positions from the in-memory implementation.
- A bounded asynchronous reader can define end-of-current-stream, cancellation, and backpressure without requiring live subscription in the kernel. The cheapest check is a slow-reader test with bounded buffering and cancellation.
- Snapshot publication can begin with parent comparison while monotonic-position and retention cooperation remain explicit research questions. The cheapest check is competing publication tests plus a written account of what the store cannot verify.
- A raw native client facade can remain thin enough that the counter works identically against a local implementation and a future transport. The cheapest check is keeping framing and recovery helpers outside the kernel traits.

## Settled Preparation Decisions

- Rust is pinned to `1.98.1` with the minimal rustup profile plus `rustfmt` and Clippy.
- `rust-service/target/` is ignored without adding a repository-wide Rust ignore rule.
- `rust-service` is an application workspace and commits its root `Cargo.lock`; member library crates do not carry separate lockfiles.
- Formatting, linting, building, testing, and example commands are documented in `DEVELOPMENT.md`. The provisional example package name must be confirmed when the workspace manifest is created.
- Iteration `0001` records are not initialized until the validated foundation commit exists.

## Open Semantic Decisions

- Append/read bytes and finite-reader behavior are settled for iteration `0001` by [Decision 0001](decisions/0001-byte-and-reader-contract.md).
- Receipt durability and snapshot publication are settled for iteration `0001` by [Decision 0002](decisions/0002-receipts-and-snapshots.md); the durable-log spike may still produce evidence for a later superseding decision.
- Position serialization and stream-generation identity: owned by core traits and raw client; blocks network transport, not the initial in-process path; define only the minimum required by the first iteration.
- Retained-history restart information: owned by a future retention workstream; not blocking because iteration `0001` implementations retain all committed records.
- External snapshot-store monotonicity: owned by the durable-log spike; not blocking the in-memory or coupled file stores.
- The transparent wrapper selection and exact iteration scope are settled by [Decision 0003](decisions/0003-iteration-0001-scope.md).

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Process gap | Iteration records covered Phase 2 and Phase 3 but omitted the interactive foundation where core API decisions occur. | Review of `PLAN.md` and the coordination skill before implementation. | Important design and agentic-development evidence could have been lost. | Added this contemporaneous foundation report and a completion validator. | Start research logging at the first design-bearing phase, not at parallelization. |
| Tool context | An isolated validator test left `RUST_SERVICE_RECORDS_REPOSITORY_ROOT` set in a persistent terminal, causing later checks to report that present files were missing. | The editor and `ls` showed the files while the validator resolved its root to a deleted `/tmp` directory. | Produced misleading validation failures and repeated investigation. | Cleared the override and made the script print an explicit diagnostic whenever an override is active. | Test-only environment overrides must be command-scoped or conspicuous because agent terminals preserve state. |
| Instruction design | The proposed clean-session prompt repeated read order, reporting, autonomy, and handoff rules that belonged to the repository workflow. | A prompt audit found those rules were distributed or implicit even though the architecture itself was documented. | A new agent could depend on hidden prompt context or ask unnecessary questions. | Added a Phase 1 operating contract to `PLAN.md` and a clean-context entry procedure to the coordination skill. | Keep launch prompts small by making repository-owned instructions sufficient; test this in the fresh Phase 1 session. |
| Preparation drift | The report claimed the target directory was ignored at the recorded source, but a fresh `git check-ignore` returned no match. | `git check-ignore -v rust-service/target/example` at `b674fd9730af` produced no output. | Phase 1 builds would create untracked output and the preparation evidence was stale. | Added `rust-service/.gitignore` with `/target/` and retained this correction in the record. | Re-run cheap environmental claims at clean-context entry instead of trusting preparation snapshots. |
| Focused validation | The first memory test compile failed because `unwrap_err` required the successful stream type to implement `Debug`, and a position was moved twice. | Initial `cargo test -p snapshotted-stream-memory` diagnostics E0277 and E0382. | No contract or implementation defect; delayed the baseline by one local edit. | Matched the result explicitly and cloned the opaque position; the same command then passed 4 tests. | Avoid assertion helpers whose incidental trait bounds leak into opaque asynchronous return types. |

## Deliverables and Dependency Graph

- `snapshotted-stream-core` owns only opaque positions, bytes, receipts, finite readers, snapshots, capabilities expressed by traits, and stable error categories.
- `snapshotted-stream-conformance` provides a reusable async baseline; implementations invoke it without copying tests.
- `snapshotted-stream-memory` is the reference implementation and currently passes the shared baseline plus local reader and snapshot regressions.
- `snapshotted-stream-client` is a thin raw-trait helper; `snapshotted-stream-counter` demonstrates framed appends, snapshot publication, and recovery against memory.
- File, durable-log, compression, and Fluid sequencer crates compile as isolated Phase 2 ownership boundaries depending inward on core.
- [The workstream manifest](../WORKSPACE_ARCHITECTURE.md) records the complete dependency graph, active iteration `0001` owners, writable paths, evidence, deliverables, composition matrix, and deferrals.
- [The benchmark specification](BENCHMARKS.md) records workloads, procedure, statistics, semantic comparison rules, and required environment metadata.

## Validation Evidence

Preparation checks completed on 2026-09-12:

- `rustc --version`: `rustc 1.98.1 (48a229cea 2026-09-01)`.
- `cargo --version`: `cargo 1.98.1 (797e8a9bc 2026-08-05)`.
- `cargo fmt --version`: `rustfmt 1.9.0-stable (48a229ceae 2026-09-01)`.
- `cargo clippy --version`: `clippy 0.1.98 (48a229ceae 2026-09-01)`.
- The preparation ignore claim was falsified and corrected by adding `rust-service/.gitignore`; final validation will recheck it.

Implementation checks completed on 2026-09-12:

- `cargo test -p snapshotted-stream-memory`: passed 4 tests after the focused test repair.
- `cargo test -p snapshotted-stream-memory -p snapshotted-stream-client`: passed 5 memory tests and the client build.
- `cargo run -p snapshotted-stream-counter`: passed and printed `recovered counter: 4`.
- `cargo check --workspace --all-targets`: passed after all Phase 2 boundary crates were registered.
- `cargo fmt --all -- --check`: passed after applying rustfmt.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`: passed with no diagnostics.
- `cargo build --workspace --all-targets`: passed.
- `cargo test --workspace --all-targets --all-features`: passed 5 tests with no failures.
- `cargo run -p snapshotted-stream-counter`: passed and printed `recovered counter: 4`.
- `cargo fmt --all -- --check && cargo test -p snapshotted-stream-memory`: passed after initial-snapshot coverage was added to shared conformance.
- `node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-foundation`: preflight correctly reported only the active status and required completion marker; after user approval and report completion it passed with `Foundation passes artifact validation.`
- `git diff --check`: passed; editor diagnostics reported no errors in the Rust workspace or CI workflow.
- `git check-ignore -v rust-service/target/example`: matched `rust-service/.gitignore:1:/target/`.

## Decisions and Human Interventions

- The user requested that costly issues, iteration reports, key decisions, and useful skills become durable project artifacts rather than optional retrospective notes.
- The user approved [Decision 0001](decisions/0001-byte-and-reader-contract.md), [Decision 0002](decisions/0002-receipts-and-snapshots.md), [Decision 0003](decisions/0003-iteration-0001-scope.md), and the five iteration `0001` workstreams on 2026-09-12.

## Agentic Development Findings

- Structural validators should reject incomplete records, but reports must begin before implementation so they can capture failed attempts contemporaneously.
- Environment checks should precede scaffolding; this established that Rust 1.98.1, rustfmt, and Clippy are already available and avoided unnecessary installation work.
- A shared conformance function is sufficient for implementations to reuse semantic tests while retaining implementation-local regression tests.

## Phase 1 Readiness Assessment

Phase 1 is complete and user-approved. The compiling workspace, public recovery path, reference implementation, reusable conformance baseline, crate boundaries, workstream manifest, dependency graph, composition matrix, benchmark specification, documented commands, root lockfile policy, scoped target ignore, and targeted CI exist. Format, Clippy, build, tests, example, artifact validation, whitespace, and diagnostics pass. Position serialization, retained-history restart details, and external snapshot monotonicity remain assigned non-blocking research questions. The clean foundation commit is the remaining mechanical completion step.
