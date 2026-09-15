# Iteration 0008 Charter

Status: active
Source commit: `4dd96bf3178264eb48fb4a1d23ca32b5102a193e`
Coordinator: GitHub Copilot

## Questions and Hypotheses

Can one bounded, cancellable WebTransport subscription atomically catch up from an opaque projected cursor and tail accepted operations exactly once and in order, resume without hidden retry, and terminate under native shutdown policy? Disprove first by seeding A, racing B at the catch-up/tail boundary, appending C after tail begins, requiring A/B/C once with monotonic cursors, resuming after B to receive only C, holding the consumer to exercise bounded backpressure, and shutting down with zero owned tasks.

## Active Workstreams

- `live-projected-operation-streaming`: GitHub Copilot implementation agent. Depends on completed iteration `0007`. Owns protocol, service, native/browser WebTransport wrappers, focused tests/harnesses, the minimal Fluid driver, its report, and a decision record if the streaming frame is accepted. Expected evidence is a versioned bounded streaming contract, atomic boundary/resume/backpressure/shutdown tests, generated-WASM coverage, a no-polling Chromium SharedTree trace, and clean post-streaming benchmark evidence. Stop if this requires changing canonical append semantics, detached tasks, unbounded buffering, ambiguous cursor recovery, or production membership.

## Deferred Scope

Production membership, batching, retention, authentication, fallback/Node transports, Routerlicious/ODSP compatibility, and broad optimization are deferred because they are not needed to answer the atomic streaming and measured convergence question. Summary and storage paths remain request/response; DDS payloads remain opaque and ambiguity recovery remains caller-owned.

## Shared Validation

- `node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0008 start`
- From `rust-service/`: `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets --all-features -- -D warnings`; `cargo build --workspace --all-targets`; `cargo test --workspace --all-targets --all-features`; `cargo run --locked -p snapshotted-stream-counter`.
- Generate fresh Node and web wasm-bindgen `0.2.128` outputs with `RUSTFLAGS='--cfg=web_sys_unstable_apis'`.
- From `rust-service/tests/minimal-fluid-driver/`: format, lint, both typechecks, build, generated-WASM tests, SharedTree bundle, and benchmark bundles.
- Run focused protocol/service boundary, resume, duplicate/gap, malformed/oversized, slow-consumer, shutdown, native transport, and Chromium traces without insecure browser flags.
- Rerun the deterministic SharedTree comparison with retained samples and environment metadata; run `git diff --check` and prove root lockfiles unchanged.
- Use nvm Node `22.23.2` for engine-constrained installs/builds; the benchmark runner may use validated Node 24.

## Risks and Escalation

- An atomic catch-up/tail boundary may require a storage notification primitive absent from current service abstractions; minimize this to a race test before proposing a shared semantic change.
- WebTransport stream cancellation and backpressure must compose with native drain without detached futures or unbounded queues.
- Browser WASM access must remain serialized despite a long-lived subscription.
- Cursor resume must reject gaps and suppress duplicates deterministically without exposing canonical positions.
- Three similar failed attempts, a required kernel/append change, production membership dependency, polling substitution, or unverifiable benchmark semantics ends Phase 2 early with retained evidence.
