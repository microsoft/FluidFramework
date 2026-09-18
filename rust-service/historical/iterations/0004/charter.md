# Iteration 0004 Charter

Status: active
Source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Coordinator: GitHub Copilot primary agent with interactive user approval

## Questions and Hypotheses

1. **Service assembly:** Can accepted storage, fencing, and Fluid sequencing run behind one versioned transport-neutral protocol without a kernel change? Disprove with a two-process create/open, submit, snapshot, kill/restart, recover, and stale-session trace.
2. **WebTransport:** Can native and browser-WASM clients exchange identical reliable protocol frames with a native HTTP/3 server? Disprove with native and headless-browser reconnect/resume traces against the same server.
3. **Native client lifecycle:** Can an explicit state machine expose recovery, ambiguity, fresh-session reconnect, and caller-controlled regeneration without hidden retry? Disprove with disconnect-before-ack and disconnect-after-commit traces.
4. **Benchmark baseline:** Can seeded workloads and an environment manifest produce repeatable results without comparing unlike guarantees? Disprove with five baseline repetitions whose uncontrolled variance prevents interpretation.
5. **Encryption:** Can authenticated record/snapshot envelopes preserve shared semantics with safe nonce and key identity policy? Disprove with conformance, wrong-key, rotation, and corruption tests.
6. **Stateful compression:** Can bounded restart state improve cross-record compression while preserving arbitrary-position reads and retention safety? Disprove with every-position resume and snapshot/reopen tests that require unbounded replay or unavailable history.

## Active Workstreams

- **Wave 1, service-assembly:** owns new protocol/service crates and runnable service example. It produces the protocol prerequisite. Stop before changing kernel semantics or claiming multi-host safety.
- **Wave 1, encryption-wrapper:** owns a new encryption wrapper crate. It is independent and must stop on nonce-safety uncertainty, unaudited cryptography, or plaintext leakage.
- **Wave 1, stateful-compression:** owns a new stateful compression wrapper crate. It must stop if transparency requires unbounded replay, delayed receipts, changed positions, or retention-unsafe state.
- **Wave 1 scaffold/Wave 3 matrix, benchmark-baseline:** owns benchmark harness and documentation. Fixture/schema work may run immediately; integrated comparisons wait for accepted service, client, transport, and wrapper commits.
- **Wave 2, webtransport:** owns target-specific native and browser transport crates/tests. Implementation waits for the integrated protocol artifact; dependency research may begin immediately. Stop on semantic divergence, unbounded queues, implicit reconnect, or an insecure-browser-only result.
- **Wave 2, native-client-lifecycle:** owns the client crate. State-machine work may use accepted sequencer semantics, but transport integration waits for the protocol artifact. Stop if correctness requires hidden retries or treating storage receipt as protocol acceptance.

All six branches and worktrees start from the kickoff commit. The coordinator cherry-picks prerequisite commits into delayed workstreams without rebasing and records the resulting ancestry. Every agent owns only its instruction/report paths and listed implementation paths; root workspace membership and `Cargo.lock` belong to integration.

## Deferred Scope

Distributed fencing and hardware power-loss qualification are deferred because [Decision 0006](../../decisions/0006-scoped-deployment-boundaries.md) accepts the single-host prototype boundary. Browser storage, caching/retention/GC, content-addressed blobs, full Fluid drivers, SharedTree integration, and broad optimization wait for an assembled service, usable clients, and reproducible measurements. Authentication, authorization, key distribution, traffic-analysis protection, datagrams, WebSocket fallback, and production certificate automation are explicit non-goals of the scoped workstreams.

## Shared Validation

From `rust-service/`, integration must run:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo run -p snapshotted-stream-counter
node ../.github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0004 phase-2
```

WebTransport additionally requires native tests, `cargo check --target wasm32-unknown-unknown`, WASM binding generation, and headless Chromium behavior. Every applicable direct/wrapper/process implementation must run shared conformance. Workstreams use isolated `CARGO_TARGET_DIR` values and disposable exact copies for dependency resolution; only integration updates root workspace membership and the committed lockfile.

## Risks and Escalation

- Rust HTTP/3, TLS, WASM, and browser bindings may create incompatible dependency or certificate requirements. Preserve the smallest failing native/browser trace and return to Phase 3 if one shared protocol cannot serve both.
- Stateful compression may be incompatible with arbitrary resume and retention. A well-evidenced negative result is complete work, not permission to weaken semantics.
- Encryption fails closed: stop on nonce reuse risk, custom cryptography, key exposure, or ambiguous corruption classification.
- Parallel work may conflict in the root manifest/lockfile. Workstreams must not commit either; integration registers dependencies in wave order and reruns direct conformance after each wrapper.
- Service/client policy may accidentally hide retries or conflate storage and protocol acceptance. Decision 0004 remains controlling.
- Move to Phase 3 early if a shared API change is required, protocol consumers need incompatible semantics, or dependency/toolchain constraints invalidate more than one workstream.
