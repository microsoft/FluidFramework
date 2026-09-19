# Iteration 0003 Charter

Status: active
Source commit: `baa5900841161074a733f60ee424c20ed8d8c70f`
Coordinator: interactive user and GitHub Copilot

## Questions and Hypotheses

- **Deployment fencing:** A deployment-backed epoch or lease can remain exclusive from fence validation through append across processes. The cheapest disproof pauses an old owner after validation, rotates ownership, resumes two contenders, and observes an old-owner append or two accepted successors.
- **Process crash recovery:** `SDLOG002` and atomic snapshots recover to an acknowledged prefix and an old/new lineage member after abrupt child-process termination. The cheapest disproof is one kill/reopen trace that loses acknowledged data, accepts complete corruption, or recovers an impossible lineage.
- **Process-isolated transport:** A bounded framed IPC protocol can expose validated opaque token positions and explicit reconnect without changing synchronous `PositionCodec`. The cheapest disproof is a capacity-one two-process resume trace that requires local backend access, hidden retry, duplication, loss, or unbounded buffering.

## Active Workstreams

| Workstream | Owner | Dependencies | Writable paths | Expected evidence and stopping condition |
| --- | --- | --- | --- | --- |
| `deployment-fencing` | GitHub Copilot deployment-fencing agent | Authoritative sequencer and Decision 0004 | `crates/fluid-sequencer/`, its report | Deterministic multi-process ownership rotation, stale rejection, failover replay, and ambiguity evidence; stop on an irreducible atomic storage requirement. |
| `process-crash-recovery` | GitHub Copilot process-crash-recovery agent | Durable snapshot spike and expanded conformance | `crates/spikes/durable-log/`, its report | Child-process termination around append/snapshot durability boundaries and reopen evidence; stop on timing-only synchronization or acknowledged-data loss. |
| `process-isolated-transport` | GitHub Copilot process-isolated-transport agent | Local network behavior, Decision 0005, conformance fixtures | `crates/wrappers/network/`, its report | Versioned bounded IPC, token resume, reconnect, malformed-frame, snapshot, and composition evidence; stop on a minimized shared codec/API gap. |

All three workstreams begin concurrently from the kickoff. They have no implementation-path dependency or writable-path overlap.

## Deferred Scope

An asynchronous `PositionCodec` change is deferred until process-isolated transport proves it necessary. Hardware power-loss testing is not equated with child-process termination and remains deferred pending an appropriate harness. Encryption, browser storage, caching, retention, block compression, full Fluid drivers, and broad optimization do not answer the three remaining convergence questions more cheaply.

## Shared Validation

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo build --workspace --all-targets`
- `cargo test --workspace --all-targets --all-features`
- `cargo run -p snapshotted-stream-counter`
- Directly run every newly applicable shared conformance helper against each accepted implementation.
- `node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0003 start`
- Phase 2 integration additionally runs `validate 0003 phase-2`; Phase 3 runs `validate 0003 complete`.

## Risks and Escalation

- Shared trait, semantic, conformance, workspace, decision, and root-lockfile changes require coordinator ownership and a minimized failing case.
- Process tests must use deterministic readiness/control messages and bounded waits, not sleep-based correctness synchronization.
- Deployment fencing stops before claiming cross-host safety unsupported by its authority or filesystem model.
- Crash recovery must distinguish process termination from power loss and stop on flaky or unreproducible evidence.
- Transport stops rather than changing `PositionCodec`, adding hidden retry/live tailing, or weakening queue bounds.
- Three similar failed approaches, an ownership violation, or one blocker affecting multiple workstreams moves the iteration to Phase 3 early.
- Delegated validation must identify its absolute checkout and branch, use isolated Cargo targets during concurrency, and preserve the shared lockfile.
