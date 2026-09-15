# Iteration 0007 Charter

Status: active
Source commit: `9c65ff3e7b6439a844461d215826491b36bb15e1`
Coordinator: GitHub Copilot

## Questions and Hypotheses

1. Can a document-service-owned connection state preserve projected cursor, checkpoint, stable logical writer/session identity, pending submissions, and membership projection across Fluid's default read-to-write replacement without duplicate replay, hidden retry, or DDS payload decoding? Disprove first by removing `Fluid.Container.ForceWriteConnection`, delivering a remote edit to a read connection, editing from that view, and checking bounded replacement, exactly one submission, and convergence.
2. Can the native WebTransport server stop accepting new sessions and deterministically drain or cancel its owned connection futures by a deadline without weakening connection limits, losing terminal errors, detaching tasks, or moving the non-`Send` fence guard? Disprove first with two held sessions, a shutdown request, a third connection attempt, and bounded completion with zero active connections.

## Active Workstreams

- `fluid-read-reconnect-lifecycle`: GitHub Copilot implementation agent; no dependency beyond this kickoff. Writable paths are `rust-service/tests/minimal-fluid-driver/**` and its report. It must produce generated-WASM Node evidence and a real Chromium default-mode SharedTree trace covering read delivery, read-to-write replacement, one edit per client, explicit ambiguity recovery, convergence, and cold replay. Stop and escalate if success requires an FSP4 contract change, private FSQ2 decoding, hidden retry, synthetic sequence reuse, or production membership claims.
- `native-graceful-shutdown`: GitHub Copilot implementation agent; no dependency beyond this kickoff. Writable paths are `rust-service/crates/wrappers/webtransport-native/**`, focused native/browser transport harness files needed for shutdown evidence, and its report. It must define bounded drain/cancel semantics and prove stop-accepting, active-session disposition, timeout/cancellation, terminal error propagation, zero active connections, and real Chromium behavior. Stop and report if the transport cannot distinguish graceful drain from cancellation or if the design requires detached tasks, leaked guards, or kernel changes.

The workstreams are dependency-independent and should run concurrently from the same kickoff commit. Neither may edit root Cargo or pnpm lockfiles, accepted decisions, prior iteration records, or the other workstream's owned implementation paths.

## Deferred Scope

- Live projected-operation streaming is deferred until reconnect cursor transfer and native shutdown/cancellation semantics are established. Phase 3 will decide whether to schedule it as iteration `0008`; implementation now would overlap both active ownership boundaries.
- Submission pipelining, batching, and broad optimization are deferred until default lifecycle benchmark evidence separates adapter round trips from service cost.
- Retention/garbage collection, browser storage, distributed fencing, hardware power-loss qualification, cloud blob storage, authentication/authorization, Node WebTransport, and production package publication remain outside the single-host lifecycle questions.

## Shared Validation

- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0007 start`
- From `rust-service/`: `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets --all-features -- -D warnings`; `cargo build --workspace --all-targets`; `cargo test --workspace --all-targets --all-features`; `cargo run --locked -p snapshotted-stream-counter`.
- Generate fresh Node and web wasm-bindgen outputs from the exact checkout with `RUSTFLAGS='--cfg=web_sys_unstable_apis'` for browser builds.
- From `rust-service/tests/minimal-fluid-driver/`: `pnpm run check:format`; `pnpm run lint`; `pnpm run typecheck`; `pnpm run typecheck:shared-tree`; `pnpm run build`; `pnpm test`; `pnpm run build:shared-tree`; `pnpm run build:benchmarks`.
- Run the original Chromium transport and SharedTree traces without insecure browser flags, the new default-mode lifecycle trace, shutdown-specific native tests, and the committed comparison benchmark after integration.
- Run `git diff --check` and prove root `Cargo.lock` and `pnpm-lock.yaml` remain unchanged in each workstream.

## Risks and Escalation

- Fluid may require audience/quorum or replacement-stream behavior that cannot be projected faithfully without an FSP4 contract change. Minimize the missing field or operation and escalate rather than adding synthetic behavior silently.
- The WebTransport library may expose cancellation but not a graceful QUIC close acknowledgment. Report that distinction and implement only semantics that can be observed.
- Long-lived projected streaming depends on both lifecycle outcomes and is not an iteration `0007` implementation fallback.
- Any required shared protocol, kernel, sequencer, root manifest, or lockfile change stops the owning workstream for coordinator review.
- Three materially similar failed attempts, an unbounded wait, hidden retry, or evidence that cannot identify its checkout moves the affected question to Phase 3 with the failure retained.
