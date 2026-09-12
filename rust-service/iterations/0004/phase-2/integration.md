# Iteration 0004 Phase 2 Integration

Status: in progress
Integration branch: `rust-service-iteration-0004`
Iteration base commit: `30c4a06d7b456e135e046905553dd23d14326a56`
Integration commit: pending final Phase 2 integration

## Accepted Work

Wave 1 accepted in this order:

- Service assembly: original `07859c93e53d6609a2c12d84fd84576d0ba95900..fe19c8743e5` became integration commits `90fb50966e1..724464e4d9a`, followed by repair `fcdb949094a`.
- Encryption wrapper: original `e3de2420ccca44ccf38d768795221a7606d6a332..e756f49d3434774db694b711c4505a5ed3866759` became `1f27e6ab604..7b2b1635285`.
- Stateful compression: original `5cb5a4f692d..fb3b7e10712` became `1a2693d6984..4a8c4582970`.
- Benchmark Wave 1: original `ce1fe2769ccbff78df8092905f1b81ccb7d4ca7e..cd8987cf1582e8c32f2f56518917747952ee2d90` became `9961bcc1212..b89db978195`.

- WebTransport: original `63eeedb5e4affa6e925479d3de50aafe235c6fdf..ac6aaeb2b416e26d3871a0103e70964082039d4c` became `46d807092d0..77ac7de09a8` after consuming the shared service prerequisite.
- Native client lifecycle: original `23e09990a626e53be25d1310e5545ba4ee4f763e..948782922e83ec103f896c2d00df50b59f5a6c02` became `6f4bb557fb7..ab900c8d10e` after consuming the same prerequisite.

Benchmark Wave 3 remains pending.

## Rejected or Deferred Work

None rejected. Adaptive prior-record compression was rejected within its workstream because arbitrary resume after retention would require unavailable or unbounded history; the accepted immutable dictionary wrapper remains independently restartable. Benchmark service/transport/wrapper matrices are deferred to Wave 3 within this iteration.

## Conflict Resolution and Adaptation

All Wave 1 cherry-picks were path-disjoint. Focused integration compilation found two service-assembly defects not caught by its disposable validation: `decode_request` returned a bare `Request` match instead of `Result`, and strict workspace Clippy rejected the 114-line request handler. Commit `fcdb949094a` wraps the match in `Ok` and splits the handler into operation-specific helpers without changing behavior. Integration centrally registered six new packages and regenerated the shared lockfile.

Wave 2 cherry-picks were path-disjoint. Strict integrated Clippy found two test-only wildcard matches in the lifecycle process harness; `a2c88795c78` names the sole opposite protocol variants explicitly. Integration registered native and browser WebTransport packages and regenerated the shared lockfile.

## Validation Evidence

Wave 1 focused validation used `CARGO_TARGET_DIR=/tmp/fluid-rust-0004-integration-target`:

- Tests passed for protocol, service, service example, encryption, stateful compression, and benchmarks; encryption passed 15 tests and stateful compression passed 10.
- Strict Clippy passed for all six packages after `fcdb949094a`.
- `cargo fmt --all -- --check` passed.

Wave 2 focused validation used the same isolated target:

- Native WebTransport passed 1 test and reported 1,304 FSP4 bytes, peak one active stream, and 7 ms explicit reconnect.
- Native lifecycle passed 12 unit and 2 process tests with no failures.
- Strict native Clippy and browser `wasm32-unknown-unknown` Clippy passed.
- Browser release build and `wasm-bindgen 0.2.128` generation passed.
- Fresh integrated Headless Chromium 152 behavior passed without insecure flags: 1,577 FSP4 bytes, 363 peak response bytes, 5 ms reconnect, and one resumed record.
- `cargo fmt --all -- --check` passed.

Workspace and artifact completion gates remain pending until benchmark Wave 3 integrates.

## Cross-Workstream Findings

- Service assembly confirms transport consumers can share `fluid-service-protocol` frame bytes, but historical reads expose canonical sequencer records rather than decoded projected Fluid operations.
- The sequencer fence guard is intentionally non-`Send`, so the first runnable service is capacity one rather than falsely weakening the fence boundary for concurrency.
- Encryption composes outside compression and adds 51 bytes per payload. Key lifecycle remains external.
- Immutable-dictionary zstd improves the seeded repeated workload but expands seeded incompressible records; adaptive predecessor state is incompatible with current arbitrary resume and retention contracts.
- Very short startup/read/recovery benchmark observations are noisy; throughput and persisted-byte baselines are more stable.
- Native and browser WebTransport share unchanged FSP4 bytes, but native service `Send` constraints keep the tested server serial.
- Explicit client replay resolves pre/post-commit disconnect after service recovery. A still-running `RecoveryRequired` service has no FSP4 recovery operation, so the client exposes the unresolved state rather than retrying.

## Artifact Check

Wave 1 and Wave 2 reports and commits are accounted for. Generated certificates, private keys, browser profiles, service data, and WASM bindings are ignored and uncommitted. Intentional integration changes are root workspace membership and regenerated `Cargo.lock`. Benchmark Wave 3 and final integration evidence remain pending.
