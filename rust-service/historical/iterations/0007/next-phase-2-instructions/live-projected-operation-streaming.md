# Iteration 0008: live-projected-operation-streaming Instructions

Derived from iteration: 0007
Status: planned
Owner: GitHub Copilot implementation agent

## Approved Scope

Replace projected-read polling with a long-lived projected-operation subscription across the Rust protocol/service, native WebTransport wrapper, generated browser WASM client, and minimal Fluid driver. The [iteration `0007` Phase 3 decision](../phase-3-report.md#next-iteration-scope) approves atomic catch-up plus tail, opaque-cursor resume, gap/duplicate handling, bounded backpressure, explicit cancellation, native shutdown composition, and post-streaming SharedTree benchmark evidence.

Keep DDS payloads opaque, ambiguity recovery explicit, and existing summary/storage paths request/response. Do not add production membership, batching, retention, authentication, fallback transport, Node WebTransport, Routerlicious/ODSP compatibility, or broad optimization.

## Prior Evidence

- [Phase 2 integration](../phase-2/integration.md#cross-workstream-findings): document lifecycle owns resume/projection state; native server owns future cancellation and drain disposition.
- [Fluid lifecycle report](../phase-2/fluid-read-reconnect-lifecycle.md): default replacement passes, but 12 explicit projected reads were needed and history/live envelopes must be deterministic.
- [Shutdown report](../phase-2/native-graceful-shutdown.md): owned connection futures drain/cancel deterministically, with application-level stop-accepting and zero active connections.
- Committed benchmark evidence at `rust-service/benchmarks/shared-tree/13401fe0de3/`: Rust median 13.31 ops/s and 58.1 ms edit convergence versus Tinylicious 58.24 ops/s and 4.6 ms, explicitly provisional because Rust polls while Tinylicious pushes.
- Existing accepted decisions: projected reads and ambiguity recovery remain explicit; portable transport remains behind generated WASM.

## Hypothesis and Discriminating Check

Hypothesis: one bounded, cancellable WebTransport subscription whose server path atomically reads from an opaque projected cursor and then tails accepted operations can deliver every operation exactly once and in order across the catch-up boundary, reconnect from the last delivered cursor without hidden retry, and terminate according to native shutdown policy.

Cheapest discriminating check: seed operation A, subscribe after the prior cursor, race append B exactly while catch-up transitions to tail, append C after tail begins, and require A/B/C once in order with monotonically advancing opaque cursors. Disconnect after B, resume from B's cursor, and require only C. Hold the consumer to trigger the configured backpressure bound, then require a documented resumable overflow or bounded blocking outcome. Request native shutdown and require the subscription to drain or cancel within the declared deadline with zero owned tasks.

## Ownership and Dependencies

Writable paths:

- `rust-service/crates/protocol/**`
- `rust-service/crates/service/**`
- `rust-service/crates/wrappers/webtransport-native/**`
- `rust-service/crates/wrappers/webtransport-browser/**`
- focused conformance and browser harness files under `rust-service/tests/**`
- `rust-service/tests/minimal-fluid-driver/**`
- the generated iteration `0008` workstream report and a decision record if the shared streaming frame is accepted

Dependencies and prerequisites: iteration `0007` complete commit; the existing projected cursor contract; document-service deterministic projection state; native `ShutdownHandle`; `wtransport 0.7.2`; fresh wasm-bindgen `0.2.128` outputs. Use nvm Node `22.23.2` for engine-constrained dependency installation/builds; the benchmark runner may use its validated Node 24 runtime.

Read-only unless Phase 3 explicitly approves a boundary change: kernel stream crates, durable log, authoritative sequencer append semantics, content-addressed storage, root workspace manifests and lockfiles, accepted decisions, and prior iteration records. Do not decode DDS payloads, expose canonical storage positions, silently retry, detach subscription tasks, use unbounded channels, or weaken fencing/shutdown limits.

## Deliverables and Validation

Deliverables:

- A documented versioned streaming contract with one subscribe request and repeated projected operation/cursor events, terminal error/cancellation disposition, and hard frame/queue limits.
- Atomic catch-up-plus-tail service logic proven against an append at the transition boundary, with no scan loop, gap, duplicate, or cursor regression.
- Native ownership of every subscription future and bounded queue, integrated with immediate cancellation and bounded drain.
- Browser WASM subscription API with explicit cancel/close and no concurrent access to the non-reentrant generated client.
- Minimal Fluid delta connection using push for live operations while preserving deterministic history envelopes, default read-to-write replacement, caller-owned ambiguity recovery, and cold replay.
- Tests for duplicate suppression, gap detection, resume cursor, disconnect, slow consumer/backpressure, malformed/oversized frames, terminal service errors, and shutdown.
- A real Chromium default-lifecycle SharedTree trace with no explicit synchronization loop required for live convergence.
- A clean deterministic benchmark rerun using the same workload and environment fields as `13401fe0de3`, comparing pre-streaming Rust, post-streaming Rust, and Tinylicious with semantic differences labeled. Retain every sample and distributions for startup, throughput, median convergence, p95, wire bytes, peak frame/queue depth, and disconnect/resume. No predetermined speedup is required; explain any regression.

Validation must include exact checkout identity; Rust format, workspace Clippy/build/test/example; protocol and service conformance; generated-WASM Node tests; TypeScript format/lint/typechecks/build/tests; fresh web WASM; native and Chromium streaming/shutdown traces; `git diff --check`; and immediate proof that root lockfiles are unchanged. Record failed hypotheses, three repeated attempts, effort sinks, human interventions, workarounds, measurements, and candidate skills while work occurs.

Stop and escalate with a minimized test if atomic catch-up/tail requires changing canonical append semantics, if `wtransport` cannot provide bounded cancellation without detaching tasks, if backpressure requires an unbounded buffer, if cursor resume cannot distinguish gaps/duplicates, or if production membership is required for the scoped two-client proof. Do not substitute polling and call it streaming.
