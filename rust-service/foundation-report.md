# Foundation Phase Report

Status: ready to begin
Source commit: `f02f2437c48`
Started: 2026-09-12
Completed: <!-- TODO(required): record the completion date -->
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

- Append/read byte types and position bounds: owned by the core-traits work; blocks the reference implementation and wrappers; decide through compiling call sites and conformance tests.
- Reader completion, cancellation, and stale-position errors: owned by core traits and conformance; blocks claims of reader compatibility; decide through bounded-reader tests.
- Append receipt visibility, durability vocabulary, and ambiguous outcomes: owned by core traits; blocks the durable-log spike; distinguish guarantees rather than selecting production policy in advance.
- Snapshot parent and monotonic-position rules: owned by snapshot traits; blocks retention work but does not block an initial no-retention store; decide through competing publication tests.
- Position serialization and stream-generation identity: owned by core traits and raw client; blocks network transport, not the initial in-process path; define only the minimum required by the first iteration.
- Transparent wrapper selection for iteration `0001`: owned by Phase 1 coordination; blocks that workstream's charter; select after the byte interface is concrete.

## Notable Events

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Process gap | Iteration records covered Phase 2 and Phase 3 but omitted the interactive foundation where core API decisions occur. | Review of `PLAN.md` and the coordination skill before implementation. | Important design and agentic-development evidence could have been lost. | Added this contemporaneous foundation report and a completion validator. | Start research logging at the first design-bearing phase, not at parallelization. |
| Tool context | An isolated validator test left `RUST_SERVICE_RECORDS_REPOSITORY_ROOT` set in a persistent terminal, causing later checks to report that present files were missing. | The editor and `ls` showed the files while the validator resolved its root to a deleted `/tmp` directory. | Produced misleading validation failures and repeated investigation. | Cleared the override and made the script print an explicit diagnostic whenever an override is active. | Test-only environment overrides must be command-scoped or conspicuous because agent terminals preserve state. |

## Deliverables and Dependency Graph

<!-- TODO(required): list final crates, dependency direction, conformance baseline, counter path, and iteration 0001 readiness dependencies -->

## Validation Evidence

Preparation checks completed on 2026-09-12:

- `rustc --version`: `rustc 1.98.1 (48a229cea 2026-09-01)`.
- `cargo --version`: `cargo 1.98.1 (797e8a9bc 2026-08-05)`.
- `cargo fmt --version`: `rustfmt 1.9.0-stable (48a229ceae 2026-09-01)`.
- `cargo clippy --version`: `clippy 0.1.98 (48a229ceae 2026-09-01)`.
- `git check-ignore -v rust-service/target/example` confirms `/rust-service/target/` is ignored.

<!-- TODO(required): record successful Phase 1 format, lint, build, test, example, and foundation-artifact validation commands -->

## Decisions and Human Interventions

- The user requested that costly issues, iteration reports, key decisions, and useful skills become durable project artifacts rather than optional retrospective notes.
- [The research plan](PLAN.md) is the current source for settled scope and unresolved semantic questions. Shared semantic decisions made during Phase 1 will receive numbered records under `decisions/`.

## Agentic Development Findings

- Structural validators should reject incomplete records, but reports must begin before implementation so they can capture failed attempts contemporaneously.
- Environment checks should precede scaffolding; this established that Rust 1.98.1, rustfmt, and Clippy are already available and avoided unnecessary installation work.

## Phase 1 Readiness Assessment

Preparation is complete: the repository is clean at the recorded source commit, the Rust toolchain and components are available, build output is ignored, lockfile policy and commands are documented, and the foundation record is active.

<!-- TODO(required): assess the compiling workspace, conformance baseline, workstream manifest, dependency graph, benchmark specification, documented commands, and clean validated foundation commit -->
