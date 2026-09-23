# Iteration 0011 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0011`
Iteration base commit: `c3d0aeb25bcd347af9742391cac1d809ab45f4a7`
Integration commit: `fd37f19cf4ee1e9c46fde01f5d8ec3e420786f01`

## Accepted Work

- `kernel-storage-quality`: accepted `c0a4296e5d87ffc8a31a4b6001f3be24fd51d504`, integrated as `21d65d879e9`. It fixes empty-manifest limit enforcement and adds direct-storage boundary tests and docs.
- `fluid-service-quality`: accepted `bd5bd9af1529a3a63734884b19d95025be3607f9` through `61b01bc019d6dfb85ab6c076857abdf6a26546d7`, integrated as `675698b0101` through `22b8f2604a1`. It fixes ambiguous session-start recovery and adds protocol, sequencer, and service boundary coverage.
- `transformation-wrappers-quality`: accepted `0889d0bcfdd4a48fc90f11d80ab5e743642f2f83`, integrated as `ab4d81ba7b2`. It rejects trailing compressed data and adds corruption, truncation, bounds, lazy decoding, and wrapper documentation.
- `transport-client-quality`: accepted `97984166c63f34e0985b7142a5c5cf0ff070d43b` through `b4962fa1d76d3e5c50e714eaf1e9d72435817309`, integrated as `20ade7113b7` through `4b25645aebc`. It distinguishes clean EOF from truncated submission frames and hardens browser response-ID and terminal stream handling.
- `fluid-driver-quality`: accepted `838db7e5821f6c52c54c4c4c364b8fd8408e37c0` through `afb1d9ec166feeaa52b50c8c30944abe20f4e863`, integrated as `3688eef5678` through `4cbd4e8ac55`. It forwards the optional submission-stream capability, closes owned resources, and adds nine deterministic lifecycle tests and package documentation.
- `examples-benchmarks-quality`: accepted `248a2a02309cca38c0813a8ddb6919cd19d15029` through `4cff78a9bdcca72e4ebe5e8ebafc0b9ba75a6c53`, integrated as `0231e393fbc` through `6a4b4ceb362`. It fixes benchmark help/option parsing and native-service diagnostics, with tests and reproducibility docs.

## Rejected or Deferred Work

No workstream commit was rejected. Unbounded compression decode allocation, actual power-loss qualification, retention-based stale positions, cross-host fencing, and cancellation during an actively pending single-threaded browser read remain deferred. New features, performance optimization, wire/API redesign, and persistence migration remain outside the charter.

## Conflict Resolution and Adaptation

All workstream commits cherry-picked without conflict. Integration made three adaptations:

- Renamed stateful-compression test variables to satisfy workspace-wide `clippy::similar_names`; package-scoped workstream Clippy had not selected that dependency-inclusive lint context.
- Moved benchmark parser tests after production items to satisfy workspace-wide `clippy::items_after_test_module`.
- Updated the generated-WASM driver contract after live integration made the projected subscription acknowledgement path reachable. The test now waits for the committed operation, verifies that projected delivery removes the pending identity, and verifies that recovery performs no redundant resolution or append.

Two review outputs were discarded because they inspected the integration checkout at the kickoff commit rather than the named source commits. Direct `git show` path audits and source-branch reports replaced that evidence.

## Validation Evidence

- `cargo fmt --all -- --check`: passed after integration adaptations.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`: passed with isolated target `/tmp/iteration-0011-integration-target`.
- `cargo build --workspace --all-targets`: passed.
- `cargo test --workspace --all-targets --all-features`: passed for every workspace member; only intentional process-helper tests remained ignored and were exercised by parent tests.
- `cargo run -p snapshotted-stream-counter`: passed and printed `recovered counter: 4`.
- `cargo test -p fluid-native-service-example --all-features`: 4 passed, including kill/restart recovery and process fencing.
- Fresh browser WASM strict Clippy and release build with `web_sys_unstable_apis`: passed. Fresh Node bindings: 12 tests passed.
- Fresh web bindings and headless Chromium 152 against the integrated native service: passed; two sessions, three ordered submission responses, terminal EOF observed once, five resumed records, and committed ambiguity resolution.
- Minimal driver format, lint, build, main typecheck, 12 unit tests, and all three benchmark bundle builds: passed. The generated-WASM contract now exercises projected-operation acknowledgement after a lost submit response.
- `typecheck:shared-tree`: blocked only by pre-existing unresolved `@fluidframework/local-driver/internal`, `@fluidframework/local-driver/legacy`, and `@fluidframework/server-local-server` imports. Both fresh generated WASM package declarations resolved.
- `git diff --check`: passed. Root and Rust manifests/lockfiles are unchanged. Ignored generated bindings, certificates, service data, build output, and temporary dependency links were removed.

## Cross-Workstream Findings

- Package-scoped or `--no-deps` Clippy is insufficient as final evidence: two harmless test-layout/name lints appeared only under the workspace-wide all-target/all-feature gate.
- The optional submission-stream capability was implemented at the transport and driver layers but silently dropped by the serializing client wrapper. Capability-forwarding tests are required wherever wrappers expose structural optional APIs.
- Projected operation delivery can acknowledge a committed local submission before its explicit `Submitted` response is observed. Recovery tests must accept that authoritative path and prove no duplicate resolution or resubmission.
- Several workstreams experienced commands executing in another worktree's shared terminal. Absolute checkout/branch guards are required for retained concurrent-workstream evidence.
- Compression validates complete zlib frame consumption but intentionally has no decoded-size bound. Stateful compression has hard bounds; this difference is now documented rather than hidden.
- SharedTree typechecking depends on local-driver/server packages outside this isolated Rust-service iteration; generated WASM artifacts were no longer the blocker after integration.

## Artifact Check

All six active workstream reports are complete, contain no required template markers, and identify their clean source worktrees and commit ranges. Every accepted commit is listed above and all changed paths match charter ownership. The only integration-tree source changes beyond accepted commits are the three adaptations listed above. No generated artifact, lockfile change, benchmark evidence rewrite, or other uncommitted file is intentional.
