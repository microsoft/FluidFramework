# Iteration 0004: service-assembly Report

Status: in progress
Branch: `rust-service-iteration-0004-service-assembly`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0004-service-assembly`
Base commit: `30c4a06d7b456e135e046905553dd23d14326a56`
Final commit: implementation `07859c93e53d6609a2c12d84fd84576d0ba95900`; completed report is the subsequent report-only commit
Agent or owner: GitHub Copilot service-assembly coding agent
Model and tool version: GitHub Copilot; tool version unknown
Instruction source: [`instructions/service-assembly.md`](./instructions/service-assembly.md) at `30c4a06d7b456e135e046905553dd23d14326a56`
Session or transcript reference: none
Started and finished: 2026-09-12 (times unknown)

## Outcome

Implemented a bounded, versioned protocol crate, a single-host native service over the durable log and authoritative sequencer, and a runnable capacity-one Unix-domain service. The service supports document creation/lazy open, sessions, submission acknowledgement, finite reads, snapshots, opaque restart-stable service tokens, deterministic five-second request bounds, graceful shutdown, abrupt-death recovery, and at least two isolated documents. Confidence is high for the tested cooperating single-host Linux scope. Historical reads expose canonical sequencer record payloads as opaque bytes because the read-only sequencer has no public projected-read API.

## Hypothesis Results

Supported within the accepted single-host scope: the durable stream, file-lock fence, and authoritative sequencer compose behind one bounded protocol without a kernel API change. `kill_restart_recovery_and_stale_session_trace` creates two documents, submits to both, publishes a snapshot, kills the server, restarts it, verifies the snapshot and second document, rejects the stale session, accepts a fresh session, and shuts down cleanly. `second_process_fences_first_process` proves a second server sharing storage and authority invalidates the first server before append. The projected historical-operation API remains inconclusive because only canonical record bytes are publicly readable from the composed crates.

## Deliverables and Commits

- `rust-service/crates/protocol/`: `fluid-service-protocol`, the transport-neutral protocol artifact required by WebTransport and native-client branches.
- `rust-service/crates/service/`: `fluid-native-service`, document assembly, persistent service token adapter, snapshots, recovery, error mapping, and focused tests.
- `rust-service/examples/native-service/`: `fluid-native-service` Unix-domain executable and two-process tests.
- Implementation commit: `07859c93e53d6609a2c12d84fd84576d0ba95900` (`feat(rust-service): assemble native Fluid service`).
- Report commit: the commit containing this completed report.

Integration must add these workspace members, then regenerate `Cargo.lock`:

```toml
"crates/protocol",
"crates/service",
"examples/native-service",
```

## Validation Evidence

Validation used exact disposable copies with temporary workspace registration and isolated targets. Final checkout identity was `/tmp/fsa-final2.PcnOrW/rust-service`, branch `rust-service-iteration-0004-service-assembly`, copied from the assigned worktree at implementation commit `07859c93e53d6609a2c12d84fd84576d0ba95900`.

- `cargo test --manifest-path <copy>/rust-service/Cargo.toml -p fluid-service-protocol --all-targets --all-features`: exit 0; 5 passed, 0 failed. Tests pin fixture bytes, all request/response round trips, malformed/oversized frames, and field/read bounds.
- `cargo test --manifest-path <copy>/rust-service/Cargo.toml -p fluid-native-service --all-targets --all-features -- --test-threads=1`: exit 0; 5 passed, 0 failed. Tests cover two-document isolation, invalid/foreign tokens, stale sessions before append, stale-owner fencing, snapshots, and restart recovery.
- `cargo test --manifest-path <copy>/rust-service/Cargo.toml -p fluid-native-service-example --test process -- --test-threads=1`: exit 0; 2 passed, 0 failed. Tests: `kill_restart_recovery_and_stale_session_trace`, `second_process_fences_first_process`.
- `cargo clippy --manifest-path <copy>/rust-service/Cargo.toml -p fluid-service-protocol -p fluid-native-service -p fluid-native-service-example --all-targets --all-features -- -D warnings`: exit 0.
- `cargo fmt --manifest-path <copy>/rust-service/Cargo.toml --all -- --check`: exit 0.
- `git diff --exit-code a577eda313ebe68f6e8ba3e33e99ea0822a50d9a -- rust-service/Cargo.toml rust-service/Cargo.lock`: exit 0 in the assigned worktree.
- `git diff --exit-code 30c4a06d7b456e135e046905553dd23d14326a56 -- rust-service/Cargo.toml rust-service/Cargo.lock`: exit 0 in the assigned worktree.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Integration gap | Durable log lacks `PositionCodec`, while `AuthoritativeSequencer` requires `SequencerStorage` position encoding. | No `impl PositionCodec` exists in the durable-log crate; direct `KernelStream<DurableLog>` does not compile. | Direct composition was blocked without a read-only crate change. | Added a service-owned adapter with persisted 16-byte document scope plus 8-byte ordinal tokens, reconstructed by finite replay. | A service boundary can preserve opaque positions without forcing a universal kernel encoding. |
| Contract friction | Sequencer fence guards are intentionally non-`Send` while held across async append. | Tokio `JoinSet::spawn` failed because `RwLockReadGuard` is not `Send`. | Concurrent per-request tasks could not preserve the accepted atomic fence boundary. | Runnable server processes one bounded request at a time and applies a five-second whole-request timeout. | Do not move fencing futures across workers unless the authority contract is redesigned and re-proven. |
| Test defect | Restart test reused a submission identity across sessions. | Expected sequence 2 instead returned `SubmissionIdentityConflict`; 4/5 service tests passed. | Initially obscured restart behavior. | Included session bytes in fixture submission identities; rerun passed 5/5. | Stable submission identities must be unique per logical operation, not merely per local sequence number. |
| Process race | Abrupt death left a stale Unix socket pathname. | Restart trace received `ECONNREFUSED` while checking the old path. | One of two process tests failed. | Test removes the stale path before spawn, matching executable startup behavior; rerun passed 2/2. | Socket existence alone is not readiness after abrupt process death. |
| Tooling friction | Shared/delegated shell state repeatedly returned output from sibling iteration worktrees or hid logs. | Reported benchmark/encryption branches despite absolute service-assembly requests. | Validation evidence had to be discarded and rerun. | Used exact disposable paths, absolute manifests, isolated targets, checkout markers, and durable `/tmp` logs. | Multi-worktree validation must bind commands and evidence to an absolute checkout identity. |

## Contract and Integration Friction

The protocol prerequisite is `fluid-service-protocol` at implementation commit `07859c93e53d6609a2c12d84fd84576d0ba95900`. Its artifact is `FSP4`, version 1, with a 20-byte big-endian header: magic `[4]`, version `u16`, kind `u8`, reserved `u8`, request ID `u64`, and body length `u32`. Public types are `Frame`, `Message`, `Request`, `Response`, `Reference`, `Submission`, `CommittedRecord`, `PublishedSnapshot`, `Acknowledgement`, `SubmissionDisposition`, `ErrorCode`, `Limits`, `ProtocolError`, `encode`, and `decode`. The stable create fixture is 25 bytes for document `a`.

WebTransport and native-client branches should cherry-pick the implementation commit, import only `fluid-service-protocol`, and preserve frame bytes unchanged. They must not infer storage durability from `Response::Submitted`; it is the protocol acceptance acknowledgement defined by Decision 0004.

Shared limitation: `fluid-sequencer` exposes recovery/connect/submit but no public finite projected-read operation. The service therefore returns canonical durable sequencer record payloads opaquely. Decoded historical Fluid operations require a Phase 3 decision or a future sequencer API; this workstream did not duplicate its private `FSQ2` decoder or change the read-only crate.

## Human Interventions

The coordinator supplied the actual kickoff commit `30c4a06d7b456e135e046905553dd23d14326a56`, replacing the generated instruction's historical iteration source as authoritative worktree provenance. No implementation correction was supplied by a person.

## Measurements

- Environment: Debian GNU/Linux 13 container, Rust toolchain constrained by workspace to 1.98.1; elapsed time, CPU, memory, model version, and token use unknown.
- Protocol header: 20 bytes; stable create fixture: 25 bytes; service position token: 24 bytes.
- Default limits: 1 MiB frame, 128-byte document ID, 256-byte identities, 4 KiB position token, 512 KiB submission/snapshot payload, 768 KiB canonical record, 1,024 read records, five-second runnable request timeout.
- Runnable queue peak by construction: one active connection/request; additional Unix connections remain in the OS listen queue. No throughput benchmark was in scope.
- Dependencies: no new third-party dependency requests. New crates reuse workspace `bytes`, `thiserror`, `futures-util`, and `tokio`, plus existing core, durable-log, and sequencer crates.
- Tests: 12 passed total across protocol (5), service (5), and process (2); 0 failed in final runs.

## Proposed Decisions

No new shared decision is proposed by this branch. Phase 3 should decide whether decoded projected reads belong in `fluid-sequencer` or remain a higher-layer projection before a client claims decoded historical Fluid operation support.

## Candidate Skills and Process Changes

Candidate coordination improvement: when validating concurrent worktrees, require absolute `--manifest-path`, a workstream-specific `CARGO_TARGET_DIR`, printed checkout markers, and retained raw logs before accepting results. Reject summaries whose checkout identity differs or is omitted.

## Remaining Work and Risks

- Integration must register the three workspace members and regenerate `Cargo.lock`; neither root file was changed here.
- Historical reads are finite, resumable, and bounded but carry opaque canonical sequencer records rather than decoded historical Fluid operations. Resolve that contract before claiming full client projection support.
- The runnable service is deliberately capacity-one because the accepted fence guard is non-`Send`; this is correct but not a throughput design.
- Scope remains cooperating writers on one host with a stable authority inode and tested Linux process termination. Multi-host safety, authority-file replacement, direct storage writers, authentication, blobs, retention, hardware power loss, and non-Unix transport remain excluded.
- Within those limits, the assigned implementation and evidence are complete; decoded historical projection remains explicit follow-up work rather than a hidden claim.
