# Iteration 0011: examples-benchmarks-quality Report

Status: in progress
Branch: `rust-service-iteration-0011-examples-benchmarks-quality`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0011-examples-benchmarks-quality`
Base commit: `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Final commit: `248a2a02309cca38c0813a8ddb6919cd19d15029` (implementation and local documentation); this report is finalized in its containing follow-up commit
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model version unknown; rustc 1.98.1; cargo 1.98.1; Node.js v22.23.2
Instruction source: [`instructions/examples-benchmarks-quality.md`](instructions/examples-benchmarks-quality.md) at `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Session or transcript reference: none
Started and finished: 2026-09-13; elapsed time unknown

## Outcome

Audited the owned benchmark crate, durable-log spike, counter example, native-service example, and six retained SharedTree evidence directories. Fixed two reproduced CLI contract defects without changing production semantics: benchmark help now exits successfully and `smoke` rejects ignored options, while the native example distinguishes a missing option value from an absent option. Added regression tests and package-local reproducibility/limitations documentation. Existing benchmark evidence was not modified. Confidence is high in the focused fixes and bounded local workflows; benchmark strict Clippy remains blocked by a read-only dependency warning.

Inventory:

- `snapshotted-stream-benchmarks` exposes `smoke` and `measure`, deterministic seeded fixtures, schema-version-2 newline-delimited JSON, exact payload/read checks, clean-reopen checks, service acknowledgement/snapshot/reconnect checks, and bounded smoke sizes. Its scripts use an exact disposable copy and verify assigned roots remain unchanged.
- `snapshotted-stream-durable-log-spike` is a library/test target with duplicated checksummed framing, sync-before-ack append behavior, atomic snapshot publication, deterministic injected crash points, real child-process termination checks, corruption checks, and shared conformance. Its assumptions are single-process ownership, local filesystem sync/rename behavior, and no hardware power-loss simulation.
- `snapshotted-stream-counter` is a bounded in-memory executable with two snapshot/recovery tests and an asserted final value of `4`.
- `fluid-native-service-example` is a Unix-domain FSP4 request/response process with parser tests plus serial process tests for kill/restart, stale sessions, multi-process fencing, and graceful shutdown.
- Retained evidence consists of six commit-keyed SharedTree directories: two streaming comparisons with Rust/Tinylicious raw JSON, two six-arm capacity comparisons, one paced comparison with profile/cadence diagnostics, and one ordered-submission result. Every reviewed README labels evidence provisional or controlled-local, states workload and environment, separates measurements from guarantees, and documents comparability limits.

## Hypothesis Results

Supported: setup and interpretation quality improved without production or throughput changes. `cargo run -p snapshotted-stream-benchmarks -- measure --help` initially printed `benchmark failed: missing value for --help`; `cargo run -p fluid-native-service-example --bin fluid-native-service -- --root` initially reported `--root is required` instead of identifying the missing value. Parser tests now cover both contracts.

Supported in narrower form: owned executables already performed substantive correctness assertions, but benchmark `smoke` silently ignored extra arguments. The parser now rejects those arguments deterministically.

Falsified: an initial concern that the benchmark's XOR payload digest would accept the simple paired substitution `[fixture 0, fixture 1, fixture 0, fixture 1]` for four distinct expected fixtures. A temporary adversarial test passed because that substitution did not collide; the test was removed and no digest change was made without a reproduced defect.

Supported by audit, with no code change: retained evidence already preserves raw artifacts, source commits, environment metadata, explicit provisional status, correctness boundaries, and non-capacity interpretations. No historical artifact required correction.

## Deliverables and Commits

1. `248a2a02309cca38c0813a8ddb6919cd19d15029` (`test(rust-service): harden benchmark example contracts`): benchmark/native CLI parsing fixes and tests; local benchmark, durable-log, counter, and native-service reproducibility documentation.
2. This report's containing commit: complete provenance, audit inventory, evidence, validation, and residual-risk record.

## Validation Evidence

- Identity: `git -C /workspaces/FluidFramework-rust-service-iteration-0011-examples-benchmarks-quality branch --show-current` returned `rust-service-iteration-0011-examples-benchmarks-quality`; initial HEAD was `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`; initial status was clean. Tools: rustc 1.98.1, cargo 1.98.1, Node.js v22.23.2.
- `cargo fmt --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-benchmarks -p fluid-native-service-example -- --check`: passed.
- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-benchmarks --all-targets`: passed 5 tests, including both new command-parser tests.
- `cargo run --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-benchmarks -- smoke`: passed and printed the memory/file and seven-adapter correctness summary.
- `cargo run --quiet --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-benchmarks -- measure --help`: passed and printed usage.
- `cargo run --quiet --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-benchmarks -- measure --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1`: passed; emitted one schema-version-2 JSON result with 8 latency samples, 8 finite-read records, seed `5573589319906701683`, and 512 logical payload bytes. Timing fields are smoke observations, not retained measurements.
- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-durable-log-spike --all-targets --all-features`: passed. The execution summary reported 12 passing tests, but source inventory includes ignored/focused child entry points and the summary did not provide a trustworthy per-test enumeration; no exact total is claimed beyond the reported pass.
- `cargo clippy --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-durable-log-spike --all-targets --all-features -- -D warnings`: passed with no diagnostics.
- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-counter --all-targets`: passed 2 tests: `recovers_from_initial_snapshot` and `recovers_only_records_after_later_snapshot`.
- `cargo run --quiet --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-counter`: passed and printed `recovered counter: 4`.
- `cargo test --manifest-path <worktree>/rust-service/Cargo.toml -p fluid-native-service-example --all-targets --all-features -- --test-threads=1`: passed 2 parser unit tests and 2 process integration tests.
- `cargo clippy --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-counter -p fluid-native-service-example --all-targets --all-features -- -D warnings`: passed with no diagnostics.
- `cargo clippy --manifest-path <worktree>/rust-service/Cargo.toml -p snapshotted-stream-benchmarks --all-targets --all-features -- -D warnings`: failed before linting the owned crate because read-only `crates/wrappers/webtransport-native/src/lib.rs:480` triggers `clippy::manual_let_else` under `-D warnings`. No production dependency was changed.
- Pre-commit `git diff --check`: passed. Diffs for root and `rust-service` manifests/lockfiles were empty. Post-report checks are recorded in the report commit.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Falsified hypothesis | Added a temporary test for a simple paired duplicate/missing payload substitution against the XOR digest. | The focused test passed, disproving the proposed collision. | No correctness fix was justified. | Removed the temporary test and retained existing verification. | Adversarial verifier changes need a concrete false-positive fixture, not a structural concern alone. |
| Reproduced defect | Ran benchmark `measure --help`. | It reported `missing value for --help`. | The documented help/configuration workflow was not usable. | Added explicit help parsing plus binary unit tests; exact help invocation now prints usage successfully. | CLI help and invalid-input behavior belong in deterministic parser tests. |
| Reproduced defect | Ran native service with a value-less `--root`. | It reported `--root is required`, conflating a missing value with an absent option. | Setup failures sent users toward the wrong correction. | Extracted iterable argument parsing and added exact missing-value tests. | Separate environment argument collection from pure parsing to make failure contracts testable. |
| Validation interference | Multiple delegated/direct commands were interrupted or replaced by sibling-worktree terminal activity. | Wrong paths included `transport-client-quality`, `fluid-driver-quality`, and `transformation-wrappers-quality`; several commands exited 130. | Some runs had to be rejected and repeated; elapsed effort is unknown. | Used absolute `--manifest-path`/`git -C`, one command at a time, and accepted results only with assigned-worktree or package identity. | Multi-worktree validation must include checkout identity and raw test selection; a zero-test success is not evidence. |
| Dependency lint blocker | Ran strict Clippy for the benchmark target. | Read-only `webtransport-native/src/lib.rs:480` fails `clippy::manual_let_else`. | Benchmark strict Clippy cannot currently be green from this workstream. | Recorded without changing production code; benchmark tests and full correctness smoke pass. | Package Clippy can still be blocked by path dependencies; report the first owned-boundary-external diagnostic exactly. |

## Contract and Integration Friction

Strict benchmark Clippy depends on a read-only production wrapper that currently fails Rust 1.98.1's `manual_let_else` lint. There were no shared API changes, dependency changes, or cross-workstream implementation dependencies. Validation infrastructure was shared across concurrent worktrees and repeatedly delivered unrelated terminal output; only path-identified results were retained.

## Human Interventions

None.

## Measurements

No performance campaign or optimization was conducted. One 8-record in-memory measurement was used only to validate JSON shape and correctness counters; its timing values are not retained evidence. Source size changed by two small parser/test additions and four README updates. Dependencies and lockfiles were unchanged. Effort duration and token use are unknown.

## Proposed Decisions

No shared semantic, API, crate-boundary, conformance, or coordination decision is proposed.

## Candidate Skills and Process Changes

No new skill is proposed. The existing coordination requirement to print checkout identity and reject summaries that omit or contradict it was necessary and sufficient; zero-test filtered runs should also be treated explicitly as failed validation evidence.

## Remaining Work and Risks

- Benchmark strict Clippy remains red on the read-only WebTransport wrapper's `manual_let_else` warning. The owning production-quality workstream or integration phase should decide whether to fix that lint; this workstream must not.
- Durable-log process tests simulate termination while the OS remains running. They do not establish hardware power-loss durability, multi-process writer safety, retention, replication, or remote-filesystem behavior.
- The native example is intentionally a serial local Unix-socket integration executable with no authentication or daemon/service-manager behavior.
- Retained SharedTree measurements are provisional controlled-local evidence, not production capacity claims. Their historical files remain unchanged.
- Concurrent terminal interference prevented a trustworthy exact end-to-end rerun of the native `--root` missing-value invocation after the fix, but the pure parser regression test passed and all native binary/process targets passed.
