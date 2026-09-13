# Iteration 0011 Charter

Status: active
Source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Test depth:** Boundary, cancellation, malformed-input, and recovery tests are uneven across the workspace. The hypothesis is that focused audits will find reproducible missing cases or defects in each ownership area. The cheapest disproof is an inventory mapping documented guarantees to existing tests without finding a material gap.
- **Documentation accuracy:** Crate and package documentation may omit operational guarantees, error semantics, and validation commands. The hypothesis is that each workstream can make its owned surface independently understandable without restating source code. The cheapest check is following the owned README and rustdoc from a clean checkout and recording every missing or stale step.
- **Recent lifecycle risk:** Streaming, reconnect, cancellation, and append-only position changes have increased cross-layer lifecycle risk. The hypothesis is that deterministic fault tests can validate or expose these paths without changing public semantics. The cheapest checks inject closure or malformed input at one boundary and assert classified outcomes and recoverability.
- **Bounded quality improvement:** A parallel audit can improve quality without becoming an open-ended rewrite. A workstream succeeds with reviewed documentation, focused regression tests, and fixes for reproduced defects; finding no defect is acceptable when the report demonstrates coverage and residual risk.

## Active Workstreams

| Workstream | Owner | Dependencies | Writable paths | Expected evidence | Stopping condition |
| --- | --- | --- | --- | --- | --- |
| `kernel-storage-quality` | GitHub Copilot subagent | None | `crates/core`, `crates/conformance`, `crates/memory`, `crates/file-simple`, `crates/content-addressed`, its report | Guarantee-to-test inventory, boundary/fault tests, local docs, reproduced bug fixes | Stop on public trait or persistence-format changes |
| `fluid-service-quality` | GitHub Copilot subagent | Read-only kernel contracts | `crates/protocol`, `crates/fluid-sequencer`, `crates/service`, its report | Protocol malformed-input tests, sequencing/session/recovery tests, service docs, reproduced fixes | Stop on wire compatibility or shared sequencing semantic changes |
| `transformation-wrappers-quality` | GitHub Copilot subagent | Read-only core contracts | `crates/wrappers/compression`, `crates/wrappers/encryption`, `crates/wrappers/stateful-compression`, its report | Round-trip, truncation, corruption, cancellation, and backpressure evidence plus local docs | Stop on wrapper contract or encoded-format changes |
| `transport-client-quality` | GitHub Copilot subagent | Read-only protocol/service contracts | `crates/client`, `crates/wrappers/network`, `crates/wrappers/native-service-browser`, `crates/wrappers/webtransport-browser`, `crates/wrappers/webtransport-native`, `tests/wasm-client`, `tests/webtransport-browser`, its report | Connection/stream lifecycle and malformed-frame tests, binding checks, transport docs, reproduced fixes | Stop on protocol/wire changes or browser API redesign |
| `fluid-driver-quality` | GitHub Copilot subagent | Read-only protocol and generated bindings | `tests/minimal-fluid-driver`, its report | Pending/reconnect/resubmit and subscription lifecycle tests, package docs, TypeScript validation, reproduced fixes | Stop on Fluid public API changes or generated binding source changes |
| `examples-benchmarks-quality` | GitHub Copilot subagent | Read-only production crates | `crates/benchmarks`, `crates/spikes/durable-log`, `examples/counter`, `examples/native-service`, `benchmarks`, its report | Buildable examples, benchmark contract checks, spike limitations, reproducibility docs, reproduced fixes | Stop before performance implementation or production semantic changes |

## Deferred Scope

New features, throughput optimization, public API redesign, wire-format changes, persistence-format migration, production membership, retention, multi-node deployment, and broad Fluid Framework changes are deferred. Top-level `Cargo.toml`, `Cargo.lock`, `README.md`, `DEVELOPMENT.md`, accepted decisions, and iteration integration records are coordinator-owned. Workstreams may recommend shared changes in reports for Phase 3.

## Shared Validation

- Each workstream records absolute checkout, branch, kickoff commit, tool versions, exact commands, exit status, and final worktree status.
- Narrow tests and strict Clippy for every touched crate; `RUSTFLAGS='--cfg=web_sys_unstable_apis'` for browser WebTransport WASM checks.
- `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets --all-features -- -D warnings` from `rust-service/` after integration.
- `cargo build --workspace --all-targets` and `cargo test --workspace --all-targets --all-features` after integration.
- Fresh WASM builds and generated-binding tests for touched browser wrappers.
- Minimal-driver format, lint, build, typecheck where dependencies resolve, unit tests, and benchmark bundle builds.
- Counter and native-service examples execute successfully; benchmark/spike checks are documented and bounded.
- Root and Rust lockfiles remain unchanged unless the coordinator approves and records a dependency change.
- `git diff --check` and iteration-record validation at kickoff, Phase 2, and completion boundaries.

## Risks and Escalation

- Parallel audits can duplicate or conflict at shared contracts. Ownership is exclusive; proposed cross-boundary edits go in reports and wait for integration.
- Quality work can expand indefinitely. Each stream prioritizes externally observable correctness, recent lifecycle paths, and documentation needed to operate its surface, then stops after focused validation and a residual-risk inventory.
- Existing flaky, environment-dependent, or unavailable checks must be isolated and reported, not silently retried or weakened.
- Any finding requiring a public API, wire format, persistence format, shared semantic, dependency, root manifest, or lockfile change moves to coordinator review and, when accepted, a decision record.
- Do not convert benchmarks into optimizations. Retain reproducible defects and measurements, and defer performance changes to a later iteration.
