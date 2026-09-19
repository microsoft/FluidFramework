# Iteration 0003: process-isolated-transport Instructions

Status: planned
Branch: `rust-service-iteration-0003-process-isolated-transport`
Iteration source commit: `baa5900841161074a733f60ee424c20ed8d8c70f`
Owner: GitHub Copilot process-isolated-transport agent
Report: `rust-service/iterations/0003/phase-2/process-isolated-transport.md`

## Assignment

Prototype a bounded, versioned, framed process-isolated transport for append, finite reads, snapshots, errors, and opaque positions using real IPC or loopback sockets. Hypothesis: client positions can be validated opaque token values while backend encode/decode occurs during asynchronous requests, implementing existing traits without changing synchronous `PositionCodec`. Disprove it with a capacity-one two-process read/reconnect trace that cannot resume from a returned position without local backend access, hidden retry, duplication, loss, or unbounded buffering.

## Ownership

- Writable: `rust-service/crates/wrappers/network/` and `rust-service/iterations/0003/phase-2/process-isolated-transport.md`.
- Read-only: core, conformance, durable storage, Fluid sequencing, decisions, charter, and all other workstream paths.
- Build on bounded local transport, Decision 0005, memory/conformance fixtures, and optional compression composition.
- Crate-local test helpers, binaries, and dependencies are allowed; do not commit `rust-service/Cargo.lock`. Report integration regeneration.
- Do not change `PositionCodec` or shared APIs. Stop with a minimized counterexample if the current contract is insufficient.

## Expected Evidence

- Deterministic versioned frames with explicit size limits for requests, records, errors, position tokens, and snapshots.
- Real process isolation, capacity-one backpressure, finite-read, disconnect, explicit reconnect/resume, stale/foreign/malformed token, malformed/oversized frame, snapshot, and compression-order tests.
- Stable error classification and no hidden retry, automatic reconnect, or live-tail behavior.
- Wire-byte and queue-peak measurements under the prior local transport payload where comparison is valid, with framing overhead included.
- A completed report with commits, outcomes, failed approaches, dependencies, measurements, and candidate process improvements.

## Validation

- Print absolute checkout, branch, kickoff commit, and clean status before editing.
- `cargo test -p snapshotted-stream-network --all-features -- --nocapture`
- `cargo clippy -p snapshotted-stream-network --all-targets --all-features -- -D warnings`
- `cargo fmt --all -- --check`
- `git diff --exit-code baa5900841161074a733f60ee424c20ed8d8c70f -- rust-service/Cargo.lock`
- Use a workstream-specific `CARGO_TARGET_DIR`; retain exact test names/counts and reject output naming another checkout. Workspace validation belongs to integration.

## Escalation and Stopping Conditions

Stop if process isolation requires local backend access in the client, an asynchronous shared codec change, hidden retry, unbounded queues, or flaky timing. Preserve the smallest failing protocol trace and compare server-side token translation, client-owned token positions, and an async codec proposal without implementing a shared API change. Authentication, encryption, live subscriptions, and broad optimization remain out of scope.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
