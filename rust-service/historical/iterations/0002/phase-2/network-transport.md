# Iteration 0002: network-transport Report

Status: complete
Branch: `rust-service-iteration-0002-network-transport`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0002-network-transport`
Base commit: `d04c7aa44eb8720fee2242d98729e6916c0dcb02` (iteration source recorded by the instructions: `57b0028ff9061087b522c8dd652ca9b8b2179e50`)
Final commit: `dc34bc9b725fc6cab9d048b26be3d740d182bcc5`
Agent or owner: GitHub Copilot network transport agent
Model and tool version: GitHub Copilot; model and tool version unknown
Instruction source: `rust-service/iterations/0002/phase-2/instructions/network-transport.md` at `d04c7aa44eb8720fee2242d98729e6916c0dcb02`
Session or transcript reference: none
Started and finished: 2026-09-12; elapsed time unknown

## Outcome

Implemented a bounded typed local client/server transport for `AppendStream`, `SnapshotStore`, and `PositionCodec`. Command ingress and every finite reader have explicit capacities; readers distinguish clean finite completion from disconnect; requests are attempted once with no reconnect or retry inside the client. The implementation preserves backend positions, capabilities, durability, snapshots, and classified errors. Confidence is high for the tested local boundary and intentionally does not extend to sockets, process isolation, or live tailing.

## Hypothesis Results

Initial hypothesis: a bounded Tokio request channel and one bounded response channel per finite read can forward the raw traits and `PositionCodec` without hidden retries, live-tail semantics, or transport-specific positions. Capturing the server-side reader when the read request is handled should preserve the finite-read boundary across slow consumption and reconnect.

Cheapest disproof: with capacity one, pause a reader while more historical records exist and assert observed queued records never exceed one; then disconnect and explicitly resume from the last delivered raw position. Any loss, duplicate, live record, queue-bound violation, or implicit retry falsifies the hypothesis. Additional checks cover transport closure/error classification, foreign-generation positions, snapshot recovery, codec forwarding, deterministic wire bytes, and compression ordering when available through owned dev dependencies.

Result: supported for this local transport. `slow_reader_never_exceeds_configured_queue_capacity` observed a peak of one queued record at capacity one. `reconnect_resumes_historical_read_without_hidden_retry` reported the interrupted reader as `Unavailable`, then an explicitly created connection returned only records after the caller-supplied position. `finite_reader_excludes_later_appends` and shared conformance found no live-tail behavior. Codec and backend errors retained their classifications.

## Deliverables and Commits

- `dc34bc9b725fc6cab9d048b26be3d740d182bcc5` — bounded local protocol, raw-trait client/server adapters, metrics, tests, compression dev dependency, and pre-implementation provenance/hypothesis record.
- Report completion is committed separately after this recorded implementation commit.

## Validation Evidence

- Checkout marker for accepted results: `CHECKOUT=/workspaces/FluidFramework-rust-service-iteration-0002-network-transport`, `BRANCH=rust-service-iteration-0002-network-transport`, implementation `HEAD=dc34bc9b725fc6cab9d048b26be3d740d182bcc5`.
- Assigned checkout: `cargo fmt --all -- --check` passed after formatting.
- Exact disposable copy made with `rsync -a --exclude target/ <assigned>/rust-service/ /tmp/ff-network-copy/`; `cargo test -p snapshotted-stream-network --all-features -- --nocapture` passed 9 tests and 0 failed, including shared conformance, finite-read, reconnect, backpressure, disconnect, generation, codec, snapshot, and compression-order cases. Doc tests passed (0 tests).
- Same exact disposable copy: `cargo clippy -p snapshotted-stream-network --all-targets --all-features -- -D warnings` passed.
- Assigned checkout: `git diff --exit-code -- rust-service/Cargo.lock` passed repeatedly. SHA-256 remained `0916282ad5de404a861b12779b95766106ca1edafbd8b9c984367405ad609437` before and after manifest resolution and validation.
- `git diff --check` passed before the implementation commit.
- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0002 phase-2` exited 1 only because the iteration manifest remains `active` and the three sibling workstream reports plus `integration.md` retain required markers. It reported no unresolved marker or schema error for `network-transport.md`.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Compile correction | Used unqualified associated types where `S` implemented both `AppendStream` and `SnapshotStore`. | Rust `E0221` named ambiguous `Position` and `Error`; zero tests ran. | One local correction cycle. | Qualified the protocol and trait implementation with `<S as AppendStream>::Position` and `Error`; focused tests then compiled. | At multi-trait equality boundaries, qualify the owning trait's associated types in public signatures and implementations. |
| Validation routing | Two delegated validation attempts returned output from durable-snapshot or sequencer worktrees instead of executing the supplied network command. | Returned checkout markers named other branches/packages, so both outputs were rejected. | Delayed executable validation; no source or lockfile impact. | Used a short absolute-path probe, then a dedicated `/tmp/ff-network-copy` command whose source marker matched this worktree. | Require checkout and branch markers in retained multi-worktree evidence and reject mismatched output even when the command itself reports success. |

## Contract and Integration Friction

`PositionCodec` is synchronous, so a true asynchronous RPC cannot forward codec calls without changing the shared API. For this explicitly local transport, `NetworkClient` retains a clone of the backend handle solely for synchronous codec delegation; async stream and snapshot operations still cross the bounded protocol. This preserves raw position types and generation checks but is not a process-isolated codec design.

The compression integration is expressible as `CompressionStream<NetworkClient<MemoryStream>>`, ensuring compression happens before bytes cross the transport. Adding that owned-crate dev dependency changes the network package dependency list in the generated workspace lockfile. The assigned `Cargo.lock` was not edited; integration must regenerate it after cherry-pick.

The kickoff contains the existing shared conformance suite. Reference-model additions developed concurrently were unavailable on this branch and remain an integration-time validation dependency.

## Human Interventions

None.

## Measurements

Deterministic compression-order test: a repeated 16,384-byte payload was appended and read, for 32,768 source bytes across the logical boundary. Measured transport wire bytes were 76 and peak queued records were 1 with capacity 1. Wire accounting includes successfully transported payload bytes and snapshot-ID tokens; typed in-process position values and protocol enum overhead have no byte encoding and are excluded. No throughput or latency claim was attempted.

Environment: Linux `6.8.0-1064-azure` x86_64; `rustc 1.98.1 (48a229cea 2026-09-01)`; `cargo 1.98.1 (797e8a9bc 2026-08-05)`. Direct dependencies are workspace-resolved `async-trait`, `bytes`, `futures-util`, `thiserror`, `tokio`, and `snapshotted-stream-core`; test dependencies add conformance, memory, and compression path crates. Effort duration, model identity, and token use are unknown.

## Proposed Decisions

No shared decision is proposed. A future process-isolated transport would need Phase 3 consideration of the synchronous codec boundary, but this local experiment does not require changing it.

## Candidate Skills and Process Changes

The existing checkout-marked validation rule was materially useful: mismatched worktree output was detected and rejected twice. For concurrent worktrees, prefer short commands with an absolute source marker and a uniquely named disposable copy/target directory; never infer checkout identity from terminal state.

## Remaining Work and Risks

- Integration must regenerate `rust-service/Cargo.lock` for the new compression dev dependency, then rerun package and workspace validation.
- Integration should run the concurrently updated shared conformance suite against this client and adapt tests within the network crate if new public laws expose a defect.
- The transport is intentionally local and typed. Socket framing, process isolation, authentication, live tailing, hidden retry, and automatic reconnect are absent.
- Queue bounds are per command ingress and per active reader. Callers can intentionally create multiple readers, each with its own bounded queue; no global active-reader admission limit was added.
- Codec delegation uses a cloned local backend because the shared codec API is synchronous. Do not present this implementation as a remote codec RPC without a later shared-contract decision.
