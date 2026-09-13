# Iteration 0007 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0007`
Iteration base commit: `115d142fb2ba985b3c4952791498dfecfe8ac902`
Integration commit: the report-only Phase 2 boundary commit containing this field follows integrated HEAD `28431376b0faa8d1028c943f6dd76a5426f71945`

## Accepted Work

- `fluid-read-reconnect-lifecycle`: accepted source commits `fa9187c0d93061060acdac93041e266b83403b8d..39c9601012d3c982b0b530e8e071c2f640fb5dc7` as integration commits `92da19db60e52b01215cf3e82c886f27da5f6e2c..471f5c93aab7c112299912aae73ad7e11c897827`.
- `native-graceful-shutdown`: accepted source commits `2b6a0d8388cf2b6c63ad73351558b861c89926b4..22f48856450e868106c5797ed4767d047ae8df29` as integration commits `b7e19706844213bf7f4de511895a7974e0e2fa8e..28431376b0faa8d1028c943f6dd76a5426f71945`.

The workstreams were dependency-independent and integrated in report order only.

## Rejected or Deferred Work

No workstream was rejected. Live projected-operation streaming remains deferred because it depends on both the stable reconnect cursor/identity model and native cancellation semantics established here. Production membership, submission batching, retention, distributed deployment, authentication, and broad optimization remain outside iteration `0007`.

## Conflict Resolution and Adaptation

No cherry-pick conflicts or integration code adaptations occurred; owned implementation paths were disjoint. Integration setup required Node `22.23.2` through nvm for Fluid dependency installation because Routerlicious dependencies reject Node 24. One aborted Node 24 install added a deprecation metadata line to an unrelated nested lockfile; that exact generated line was removed before validation, and all lockfiles are clean.

## Validation Evidence

- Checkout `/workspaces/FluidFramework-rust-service-iteration-0007`, branch `rust-service-iteration-0007`, integrated HEAD `28431376b0faa8d1028c943f6dd76a5426f71945` before this report commit.
- From `rust-service/`: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo test --workspace --all-targets --all-features`, and `cargo run --locked -p snapshotted-stream-counter`; all passed. The example printed `recovered counter: 4`. The native adapter suite included 5 passing shutdown tests.
- With nvm Node `22.23.2` and pnpm `11.15.1`, targeted dependency installation completed in 123.6 seconds with no tracked changes. `compile:esm:packages` for core interfaces, driver definitions, loader, Fluid Static, Tree, and Tinylicious Client completed 81 tasks in 85.9 seconds.
- Fresh generated WASM was built from this checkout using `RUSTFLAGS='--cfg=web_sys_unstable_apis'`; matching ignored web and Node wasm-bindgen outputs were generated.
- From `rust-service/tests/minimal-fluid-driver/`: `pnpm run check:format`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run typecheck:shared-tree`, `pnpm run build`, `pnpm test`, `pnpm run build:shared-tree`, and `pnpm run build:benchmarks`; all passed. Tests: 3 passed, 0 failed. Bundle output contained only existing package export-condition warnings.
- Integrated Chromium 152 trace without insecure flags passed: 3 transport sessions, 3 independent containers, final value 3, `notCommitted` recovery, 1 explicit resubmission, 12 projected reads, sequences through 5, 40,434 FSP4 bytes, 4,157-byte peak response, and 2,078.5 ms elapsed.
- Workstream shutdown Chromium evidence passed before integration: existing traffic succeeded during drain, post-deadline traffic failed, a post-acknowledgement session was not admitted, and 2 owned sessions were cancelled after 5,081 ms.
- `git diff --check` passed. Root and nested pnpm lockfiles and Rust `Cargo.lock` have no diff. Generated bindings, bundles, certificates, dependency links, and service data are ignored.

## Cross-Workstream Findings

- Both workstreams require explicit ownership of long-lived state: the document service owns logical identity/cursor/projection across Fluid stream replacement, while the native server owns connection futures across shutdown.
- A future subscription must connect these contracts: its resume cursor and deterministic envelope projection belong to the document lifecycle, while its cancellation, drain deadline, and backpressure disposition belong to native task ownership.
- FSP4 still lacks authoritative Fluid membership operations. The adapter's two synthetic projected members are sufficient for the single-host proof but not production audience/quorum claims or multiple concurrent read-first writers.
- `wtransport` stop-accepting is application-level; a peer may complete a QUIC handshake before endpoint acceptance stops, but no new application session is owned after acknowledgement.
- Node 22 is required for engine-constrained Routerlicious setup; Node 24 remains suitable for the root benchmark runner.

## Artifact Check

Both active reports are complete and accepted. Both source worktrees and the integration worktree were clean after commits and validation. Ignored WASM bindings, TypeScript bundles, certificates, node-module links, Chromium profiles, and `/tmp` service/benchmark data are intentional disposable evidence artifacts; no tracked or reportable uncommitted artifact remains.
