# Iteration 0008 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0008`
Iteration base commit: `a13db417fb10f647f29083a2fecf039298484e1b`
Integration commit: the Phase 2 boundary commit containing this report follows accepted HEAD `bd4af7586e6389ac35269f259a64632b5b4e0e66`; its self-referential hash is intentionally not embedded

## Accepted Work

Accepted `live-projected-operation-streaming` in dependency order:

1. Workstream implementation `0d6069e5ecafcaf55ac5c067dbd42d5418064cb7`, integrated as `4e074fa8c9f0875895fd554528c4d91f93e4988c`.
2. Workstream report and benchmark evidence `6cacb9a8da347ab4bef6e7bd7a2e4f754ee330c3`, integrated as `bd4af7586e6389ac35269f259a64632b5b4e0e66`.

## Rejected or Deferred Work

None. Production membership, batching, retention, authentication, Node/fallback transports, Routerlicious/ODSP compatibility, and broad optimization remain charter deferrals rather than rejected implementation.

## Conflict Resolution and Adaptation

No conflicts or implementation adaptations. Integration-only changes are this report and the manifest status transition. Dependency installation used nvm Node `22.23.2`, frozen lockfiles, and package-scoped filters; generated declarations, WASM bindings, bundles, certificates, and service data remain ignored.

## Validation Evidence

- Exact checkout: `/workspaces/FluidFramework-rust-service-iteration-0008`, branch `rust-service-iteration-0008`, accepted HEAD `bd4af7586e6389ac35269f259a64632b5b4e0e66`.
- `cargo fmt --all -- --check`; `cargo clippy --locked --workspace --all-targets -- -D warnings`; `cargo build --locked --workspace --all-targets`; `cargo test --locked --workspace --all-targets --all-features`; and `cargo run --locked -p snapshotted-stream-counter`; all passed. Service subscription tests passed within 10 service tests; protocol and native streaming/shutdown tests passed within the full workspace; the example printed `recovered counter: 4`.
- Fresh release browser WASM built with `RUSTFLAGS='--cfg=web_sys_unstable_apis'`; wasm-bindgen `0.2.128` generated Node and web outputs. `node --test tests/wasm-client/node-test.mjs`: 12 passed, 0 failed.
- Under nvm Node `22.23.2`, package-scoped frozen installs and explicit Fluid package builds completed without tracked changes. Minimal driver format, lint, both typechecks, build, 3 generated-WASM contract tests, SharedTree bundle, and both benchmark bundles passed. Esbuild emitted only existing export-condition ordering warnings.
- Integrated Chromium SharedTree trace passed without insecure flags: final value 3, 3 independent containers, 5 projected subscriptions, explicit `notCommitted` recovery plus one resubmission, 42,638 FSP4 bytes, 1,421-byte peak subscription frame, and pending queue depth 2.
- Integrated Chromium/native shutdown trace passed: acceptance acknowledged stopped, an existing session succeeded during drain and failed after the deadline, a third session was rejected, and native evidence reported `Cancelled`, 2 owned, 2 cancelled, 5,081 ms.
- Retained clean benchmark evidence at `rust-service/benchmarks/shared-tree/0d6069e5eca/` contains ten Rust and ten Tinylicious repetitions with `sourceDirty: false`. Post-stream Rust medians: 1,225.0 ms startup, 39.98 ops/s, 28.8 ms convergence, 29.7 ms per-run p95. Pre-stream baseline: 1,271.1 ms, 13.31 ops/s, 58.1 ms, 113.9 ms. Tinylicious: 199.9 ms, 213.81 ops/s, 4.7 ms, 4.9 ms. Results remain provisional and are not production capacity claims.
- `git diff --check` passed. Root `pnpm-lock.yaml`, `rust-service/Cargo.lock`, and Routerlicious lockfile have no diff.

## Cross-Workstream Findings

- Decision `0009` accepts FSP4 v2 subscription kinds 14/74. A bounded one-slot notification is advisory; opaque cursor reads remain authoritative across catch-up/tail races and notification lag.
- Cancellation ownership composes cleanly from browser subscription through native connection futures and iteration `0007` shutdown. No detached task or unbounded queue was needed.
- Live convergence no longer polls. Bounded projected reads remain intentionally available for historical delta storage.
- Default read-to-write lifecycle passes the SharedTree trace, while the retained benchmark arm still forces write mode; benchmark comparisons must retain that semantic label.
- Production membership, replicated notifications, offered-load capacity, CPU/memory, and packet-level bandwidth remain unmeasured.

## Artifact Check

The sole active workstream report is complete and accepted. Decision `0009` and clean benchmark evidence are committed. Integration worktree is clean except for this integration record and manifest transition before the boundary commit. Generated WASM, declarations, bundles, certificates, dependency links, service data, and `/tmp` traces are ignored validation artifacts; no unexplained tracked or untracked artifact remains.
