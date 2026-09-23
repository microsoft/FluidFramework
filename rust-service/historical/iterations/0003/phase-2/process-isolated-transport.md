# Iteration 0003: process-isolated-transport Report

Status: complete
Branch: `rust-service-iteration-0003-process-isolated-transport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0003-process-isolated-transport`
Base commit: `d568058d3e6857f5f5a4c65abdaa13ed416d7254`
Final commits: implementation `2b7d8a38df433df733a1eb5508f98c06898d8716`; initial report `c8fdc96d413339a40410499a7bfd737245ecff5b`; position-token correction `385f2c0411d26b277212b4d637fe6eb8c701064e`; corrected report is the commit containing this file
Agent or owner: GitHub Copilot process-isolated-transport agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: `rust-service/iterations/0003/phase-2/instructions/process-isolated-transport.md` at `d568058d3e6857f5f5a4c65abdaa13ed416d7254`
Session or transcript reference: none
Started and finished: 2026-09-12, exact times unknown

## Outcome

Implemented an actual process-isolated transport using `std::process::Command` and Tokio Unix-domain sockets. The client stores only opaque token bytes, the server-instance discriminator learned during handshake, and socket state; the child server exclusively owns the backend and performs backend position encoding and decoding. Protocol version 1 uses deterministic big-endian length-prefixed binary frames, explicit field and frame limits, bounded per-reader and connection capacity, operation timeouts, finite read terminators, stable error-kind encoding, and no operation retry or automatic reconnect. Process position bytes use a deterministic envelope containing magic/version bytes, a stable 16-byte discriminator for the server process generation, a bounded backend-token length and bytes, and an integrity checksum. Client-side encode and decode synchronously reject malformed envelopes and tokens from another spawned server, while explicit reconnect to the same server process preserves the discriminator and succeeds. Append, finite read, head, latest snapshot, publish, explicit reconnect/resume, disconnect, malformed and oversized input rejection, position-codec conformance, and compression composition are covered by focused tests. Confidence is high for the Unix prototype scope exercised by the package tests.

## Hypothesis Results

Initial hypothesis: a client can treat positions as opaque wire tokens while a process-isolated server alone performs backend position encoding and decoding during asynchronous requests. A deterministic capacity-one test will disprove this if a token returned by one child process connection cannot resume a finite read over a fresh child process connection without client backend or codec access, hidden retry, duplication, loss, or an unbounded queue. The cheapest discriminating check is a three-record read that consumes one record, disconnects, reconnects explicitly, resumes after the returned token, and receives exactly the remaining two records.

Result: supported. `capacity_one_child_process_reconnect_resumes_opaque_position` spawned the server as a distinct operating-system process, appended `a`, `b`, and `c`, consumed `a`, dropped the first client and reader, explicitly opened a fresh socket connection, decoded the returned bytes only into `ProcessPosition`, and received exactly `b` and `c`. The observed client queue peak was one. `passes_position_codec_conformance` uses the shared `run_position_codec_conformance` runner with two actual child-server generations and passes round-trip, documented malformed-token, foreign-generation decode, and foreign-generation encode checks. The focused malformed test additionally corrupts one checksum byte in a valid same-server token and rejects it synchronously. The client has no backend field or backend type parameter; backend ownership and stale or retention validation remain server-side during asynchronous requests.

## Deliverables and Commits

- `2b7d8a38df433df733a1eb5508f98c06898d8716` - `feat(rust-service): add process-isolated transport`
- `385f2c0411d26b277212b4d637fe6eb8c701064e` - `fix(rust-service): validate process position tokens`
- `rust-service/crates/wrappers/network/src/process.rs` - process client/server, protocol codec, bounds, timeouts, metrics, child lifecycle, and focused tests.
- `rust-service/crates/wrappers/network/src/lib.rs` - Unix-only module export.
- This report - provenance, evidence, measurements, events, and integration guidance; committed separately after implementation.

## Validation Evidence

- Correction checkout identity: `/workspaces/FluidFramework-rust-service-iteration-0003-process-isolated-transport`, branch `rust-service-iteration-0003-process-isolated-transport`, code commit `385f2c0411d26b277212b4d637fe6eb8c701064e`.
- `CARGO_TARGET_DIR=/tmp/ff-rust-service-iteration-0003-process-isolated-transport-token-repair-target cargo test -p snapshotted-stream-network --all-features process::tests::passes_position_codec_conformance -- --nocapture`: passed; 1 passed, 0 failed, 20 filtered out.
- `CARGO_TARGET_DIR=/tmp/ff-rust-service-iteration-0003-process-isolated-transport-token-repair-target cargo test -p snapshotted-stream-network --all-features process::tests::child_process_rejects_foreign_and_malformed_tokens -- --nocapture`: passed; 1 passed, 0 failed, 20 filtered out. This includes checksum corruption, foreign-generation decode and encode, arbitrary malformed bytes, and empty bytes.
- `CARGO_TARGET_DIR=/tmp/ff-rust-service-iteration-0003-process-isolated-transport-token-repair-target cargo test -p snapshotted-stream-network --all-features -- --nocapture`: passed; 20 passed, 0 failed, 1 ignored child entry; doc tests 0 passed, 0 failed.
- `CARGO_TARGET_DIR=/tmp/ff-rust-service-iteration-0003-process-isolated-transport-token-repair-target cargo clippy -p snapshotted-stream-network --all-targets --all-features -- -D warnings`: passed with no warnings.
- `cargo fmt --all -- --check`: passed.
- `git diff --exit-code HEAD -- rust-service/Cargo.lock` before the code commit: passed; no lockfile change.
- `git diff --check`: passed.
- Checkout identity for accepted runs: `/workspaces/FluidFramework-rust-service-iteration-0003-process-isolated-transport`, branch `rust-service-iteration-0003-process-isolated-transport`, kickoff `d568058d3e6857f5f5a4c65abdaa13ed416d7254`.
- `CARGO_TARGET_DIR=/tmp/ff-rust-service-iteration-0003-process-isolated-transport-target cargo test -p snapshotted-stream-network --all-features -- --nocapture`: passed; 19 passed, 0 failed, 1 ignored child entry; doc tests 0 passed, 0 failed. Relevant process tests include capacity-one reconnect/resume, finite read with a concurrent later append, snapshots and tail recovery, disconnect classification, foreign and malformed token rejection, malformed and oversized frame rejection, configured field limits, deterministic version bytes, bounded timeout, and compression ordering.
- `CARGO_TARGET_DIR=/tmp/ff-rust-service-iteration-0003-process-isolated-transport-target cargo clippy -p snapshotted-stream-network --all-targets --all-features -- -D warnings`: passed with no warnings.
- `cargo fmt --all -- --check`: passed.
- `git diff --exit-code d568058d3e6857f5f5a4c65abdaa13ed416d7254 -- rust-service/Cargo.lock`: passed; no lockfile change from the actual kickoff.
- `git diff --exit-code baa5900841161074a733f60ee424c20ed8d8c70f -- rust-service/Cargo.lock`: passed; no lockfile change from the instruction source commit.
- `git diff --check`: passed.
- VS Code diagnostics for both changed Rust files: no errors.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Validation rejected | The first delegated compile request returned output from the sibling `process-crash-recovery` checkout despite an explicit requested directory. | Output named `/workspaces/FluidFramework-rust-service-iteration-0003-process-crash-recovery` and its branch/target. | No result from that run was accepted. | Re-ran in a direct terminal with printed absolute path and branch; all retained evidence names this worktree. | Checkout identity in command output is mandatory evidence in multi-worktree iterations. |
| Hypothesis refinement | The first finite-read test attempted a later append through the same connection while its reader owned that connection. | The focused suite blocked until interrupted; one socket intentionally permits one in-flight operation. | Exposed that connection-level serialization alone was insufficient for concurrent finite-read capture tests. | Added an explicit `max_connections` semaphore to bound concurrent server connections and performed the later append through a second explicit client connection. The rerun passed. | Bound connection concurrency explicitly; do not imply multiplexing when the protocol deliberately serializes each connection. |
| Strict lint repair | Initial strict Clippy reported public error-doc, checked-conversion, ownership, and test-style findings. | `cargo clippy ... -- -D warnings` failed locally. | No semantic blocker. | Reworked helper borrowing, documented public errors, retained checked frame conversion, and reran Clippy successfully. | Run strict Clippy before recording final protocol evidence because pedantic ownership findings can clarify codec boundaries. |
| Review correction | Review found that `ProcessClient::decode_position` accepted arbitrary nonempty bounded bytes and foreign-server tokens, deferring failure until an asynchronous read despite Decision 0005. | The shared `run_position_codec_conformance` requires malformed and foreign-generation decode, plus foreign-generation encode, to fail synchronously with `InvalidPosition`. | The initial report overstated consistency with the accepted position-codec contract. | Added a client-verifiable generation-scoped envelope, direct shared conformance coverage, checksum-corruption coverage, and corrected the report claims. | A process-isolated synchronous codec needs transport-owned validation metadata even though backend token semantics remain server-owned. |

## Contract and Integration Friction

The synchronous `PositionCodec` contract cannot ask a remote backend to validate backend-specific state. The process client therefore verifies a transport-owned opaque envelope: deterministic framing and integrity reject documented malformed bytes, and the handshake discriminator rejects tokens from another server process generation. This satisfies Decision 0005 without client backend access or a shared API change. Successful client-side decode does not prove that the backend still retains or accepts the enclosed position; stale and retention semantics remain intentionally asynchronous and are classified only when an operation sends the unwrapped backend token to the child.

The implementation is exported only on Unix because it uses Unix-domain sockets. Integration must regenerate nothing: no dependency or `Cargo.lock` change occurred. The existing in-process `local_transport` remains unchanged.

## Human Interventions

The user supplied the authoritative actual kickoff `d568058d3e6857f5f5a4c65abdaa13ed416d7254`, branch, worktree, strict writable paths, requirement for a real child process, and separate implementation/report commits. This corrected the generated instruction's older iteration source commit for provenance and lockfile comparison purposes.

## Measurements

- Environment: Linux dev container, Rust 1.98.1 workspace toolchain, debug test profile, Unix-domain sockets, `read_capacity = 1`, `max_connections = 16`.
- Compression-order payload: one 16,384-byte repeated-byte append followed by its read, for 32,768 source bytes across both directions.
- Process transport after the correction: 187 wire bytes including protocol version, kind, four-byte frame prefixes, field lengths, opaque position tokens, the 16-byte handshake discriminator, compressed payloads, and control frames; peak queued records 1.
- Existing local transport comparison under the same payload: 76 typed-boundary bytes; peak queued records 1. The values are not latency or throughput measurements, and the local metric intentionally excludes process framing.
- Protocol bounds: 1,048,576-byte frame, 524,288-byte record/append payload, 524,288-byte snapshot payload, 4,096-byte position token, 5-second per-connect/read/write timeout by default.
- Dependencies and lockfile: zero additions and zero lockfile changes.
- Elapsed effort and token usage: unknown.

## Proposed Decisions

No shared decision is proposed. The prototype supports the existing opaque-position and asynchronous-operation contracts without changing shared semantics or APIs.

## Candidate Skills and Process Changes

For multi-worktree delegated validation, require the retained output to print absolute checkout, branch, and workstream-specific target directory before accepting results. Reject otherwise-successful output from another checkout rather than inferring equivalence. For stream transports without request multiplexing, finite-read concurrency tests should use a second explicit bounded connection and assert the configured connection and reader capacities.

## Remaining Work and Risks

- The transport is Unix-only and is a prototype, not a Windows or cross-platform IPC implementation.
- One operation is serialized per socket connection; concurrent operations require explicit additional connections, bounded server-side by `max_connections`.
- Initial connection establishment performs bounded startup synchronization retries; completed operations do not retry and disconnected clients do not reconnect automatically.
- Authentication, encryption, process sandboxing, live subscriptions, and broad performance optimization remain intentionally out of scope.
- Backend-specific stale-position behavior is preserved by the stable error-kind wire codec; the child tests use `MemoryStream`, whose invalid/foreign token paths classify as `InvalidPosition`, while the codec round-trip test covers `StalePosition` representation.
- Client-side envelope acceptance does not validate backend retention state; stale or expired positions are still classified by the child during asynchronous read or publish operations.
- Integration should rerun workspace validation after cherry-picking the implementation and report commits. No generated artifacts or lockfile updates are expected.
