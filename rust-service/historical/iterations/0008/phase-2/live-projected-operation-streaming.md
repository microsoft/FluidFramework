# Iteration 0008: live-projected-operation-streaming Report

Status: complete
Branch: `rust-service-iteration-0008-live-projected-operation-streaming`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0008-live-projected-operation-streaming`
Base commit: `a13db417fb10f647f29083a2fecf039298484e1b`
Final commit: the closure commit containing this report and retained benchmark evidence; its self-referential hash is intentionally not embedded
Agent or owner: GitHub Copilot implementation agent
Model and tool version: GitHub Copilot; model unknown; tool version unknown
Instruction source: `rust-service/iterations/0008/phase-2/instructions/live-projected-operation-streaming.md` at `a13db417fb10f647f29083a2fecf039298484e1b`
Session or transcript reference: `fa38fc21-1536-49e1-a614-b6e07a553ae8`
Started and finished: started `2026-09-13T02:18:31Z`; finished `2026-09-13T03:42:03Z`

## Outcome

Implemented FSP4 v2 projected-operation subscriptions end to end across protocol, service, native WebTransport, browser WASM, and the minimal Fluid driver. The service atomically catches up and tails from an opaque cursor; cursor reads remain authoritative for ordering, duplicate suppression, and gap detection, while a one-slot notification channel only wakes readers. Native and browser transports own bounded cancellable streams, browser buffering retains at most two pending complete frames, and the Fluid driver emits pushed operations without projected-read polling.

Confidence is high for the assigned bounded local contract. Focused race/recovery tests, generated-WASM tests, real Chromium SharedTree convergence, coordinated native shutdown, and clean committed-source benchmarks passed. Production membership, authentication, automatic retry, Routerlicious/ODSP compatibility, and distributed-service durability remain outside this workstream.

## Hypothesis Results

- **Supported:** one bounded subscription can atomically catch up across the A/B/C transition and tail each accepted operation exactly once and in order. Service tests cover the transition, lag recovery, duplicate suppression, and gap rejection.
- **Supported:** opaque cursor resume works without hidden retry. Every benchmark repetition established and resumed both client cursors, then converged a first post-resume pushed edit.
- **Supported:** cancellation and native shutdown remain owned. Native tests passed, and the Chromium shutdown trace stopped acceptance, allowed the in-flight session during drain, rejected it after the deadline, rejected a third session, and reported two owned/two cancelled connections.
- **Supported:** push delivery removes polling from live benchmark convergence. The committed harness contains no `connection.synchronize()` call; historical delta storage retains bounded projected reads.
- **Inconclusive:** no claim is made about production throughput, multi-node operation, Routerlicious/ODSP equivalence, or packet-level network bytes. See [benchmark evidence](https://github.com/CraigMacomber/FluidFramework/blob/74f3736e4afea1aa78600636e8b45a47243a6095/rust-service/historical/benchmarks/shared-tree/0d6069e5eca/README.md).

## Deliverables and Commits

1. `0d6069e5ecafcaf55ac5c067dbd42d5418064cb7` - `feat(rust-service): stream projected operations`: FSP4 v2 contract, atomic service stream, native/browser transports, push-driven Fluid driver, tests, benchmark harness, and [decision 0009](../../../decisions/0009-projected-operation-subscription.md).
2. Closure commit containing this report and [retained benchmark evidence](https://github.com/CraigMacomber/FluidFramework/blob/74f3736e4afea1aa78600636e8b45a47243a6095/rust-service/historical/benchmarks/shared-tree/0d6069e5eca/README.md); the commit does not embed its own hash.

## Validation Evidence

- `cargo fmt --all -- --check`: passed.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`: passed.
- `cargo build --locked --workspace --all-targets`: passed.
- `cargo test --locked -p fluid-service-protocol`: 8 passed, including stable additive subscription kinds.
- `cargo test --locked -p fluid-native-service`: 10 passed, including atomic catch-up/tail and lag/duplicate/gap recovery.
- `cargo test --locked -p fluid-webtransport-native`: 6 passed, including catch-up, tail, cancellation, and shutdown lifecycle.
- `RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo clippy --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown -- -D warnings`: passed.
- Fresh release WASM build plus `wasm-bindgen 0.2.128` Node/web generation: passed.
- `node --test tests/wasm-client/node-test.mjs`: 12 passed.
- Minimal driver `pnpm check:format`, `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:shared-tree`, `pnpm build`, `pnpm test`, `pnpm build:shared-tree`, and `pnpm build:benchmarks`: passed; driver contract 3 passed. Esbuild retained its existing package export-condition warnings.
- Chromium SharedTree trace: passed with final value 3, three independent containers, five subscriptions, explicit ambiguity recovery, 42,638 FSP4 bytes, 1,421-byte peak subscription frame, and peak pending queue depth 2.
- Chromium/native shutdown trace: passed; acceptance stopped, the existing session succeeded during drain and was rejected after the deadline, a third session was rejected, and native evidence reported `Cancelled`, two owned connections, two cancelled connections, and 5,082 ms elapsed.
- Clean committed-source benchmark: ten repetitions of 100 measured edits after ten warmups for both Rust and Tinylicious; both raw artifacts report `sourceDirty: false` and commit `0d6069e5eca`. Raw evidence: [rust.json](https://github.com/CraigMacomber/FluidFramework/blob/74f3736e4afea1aa78600636e8b45a47243a6095/rust-service/historical/benchmarks/shared-tree/0d6069e5eca/rust.json) and [tinylicious.json](https://github.com/CraigMacomber/FluidFramework/blob/74f3736e4afea1aa78600636e8b45a47243a6095/rust-service/historical/benchmarks/shared-tree/0d6069e5eca/tinylicious.json).
- `git diff --check`: passed. Root `pnpm-lock.yaml` and `rust-service/Cargo.lock` remained unchanged with SHA-256 `515717f196c0b624c4c33988968ed9a516b9b1634511ce3b75c2635e579c9d9c` and `66d8d42262ef8bcc269993f7a08709c0b85e185aa1a27376409dae49b9bb9015`.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| WASM cancellation aliasing | An async `&mut self` subscription API prevented cancellation while `next()` awaited input. | Browser compile failure during implementation. | Required an ownership correction rather than a caller workaround. | Used interior mutability and `&self` methods so cancellation can proceed concurrently. | Exported cancellable async resources must not hold exclusive object borrows across suspension. |
| Browser queue measurement | The first Chromium metrics run reported depth 3. | Trace passed functionally but exceeded the intended pending-frame bound. | Disproved the initial metric interpretation. | Counted only frames retained after the delivered frame and rejected chunks that would retain more than two complete frames; rerun reported depth 2. | Define queue depth at the ownership boundary, excluding the item currently being delivered. |
| Resume benchmark probe | The first clean run failed because newly loaded clients had no cursor before any live operation. | `subscription resume did not use every connection's current cursor`. | Prevented invalid resume evidence. | Added an unmeasured pushed edit to establish both cursors, reopened subscriptions, and required another pushed edit before warmup. | A resume benchmark must first prove the resume point exists and then prove post-resume delivery. |
| Versioned test fixtures | Fresh WASM rejected legacy FSP4 v1 frames in Node and browser fixtures. | Explicit unsupported-version failures. | Blocked generated and shutdown harnesses. | Updated fixture headers and response assertions to FSP4 v2. | Protocol version bumps require auditing hand-built cross-language frames, not only production encoders. |

## Contract and Integration Friction

FSP4 moved from version 1 to version 2 because subscribe request kind 14 and repeated operation response kind 74 change the accepted wire contract. Cursor bytes remain opaque. A one-slot service notification channel is advisory; authoritative cursor reads close races and recover notification lag. The browser stream allows one frame in delivery plus at most two complete pending frames and also enforces a two-maximum-frame byte buffer. Fluid history reads remain request/response, while live convergence is subscription-only. Existing synthetic membership and force-write limitations are unchanged.

## Human Interventions

None. No human intervention was required during implementation or validation.

## Measurements

Environment: Debian 13, Linux `6.8.0-1064-azure`, AMD EPYC 7763 with 32 logical CPUs, Rust/Cargo 1.98.1, Node 22.23.2 for constrained builds and Tinylicious, Node 24.21.0 for benchmark orchestration, Chromium 152.0.7977.82, and wasm-bindgen 0.2.128.

For ten clean repetitions, post-stream Rust median startup was 1,225.0 ms, median sequential convergence throughput was 39.98 ops/s, median edit convergence was 28.8 ms, and median run p95 was 29.7 ms. The pre-stream polling baseline was 1,271.1 ms, 13.31 ops/s, 58.1 ms, and 113.9 ms respectively. Tinylicious measured 199.9 ms, 213.81 ops/s, 4.7 ms, and 4.9 ms. Every Rust run recorded 497,714 FSP4 bytes, a 1,499-byte peak request/response frame, a 1,430-byte peak subscription frame, and queue depth zero for the sequential benchmark; the burst trace reached depth two. Median reopen was 30.0 ms and median first post-resume convergence was 30.1 ms, with both cursors resumed in every run. See the retained evidence for full samples and comparability limits; these are not production capacity measurements.

## Proposed Decisions

[Decision 0009: Projected operation subscription](../../../decisions/0009-projected-operation-subscription.md) records the versioned stream, cursor authority, bounded notification/backpressure model, cancellation, and shutdown ownership.

## Candidate Skills and Process Changes

- When a stream uses notifications plus durable cursor reads, treat notifications only as wakeups and make the cursor read authoritative for exact delivery.
- For wasm-bindgen cancellation, avoid async `&mut self` methods on long-lived waits; use narrowly scoped interior mutability and never hold a `RefCell` borrow across `await`.
- Benchmark resume only after establishing a cursor, then require a post-resume event before measurement.
- After a protocol version bump, search hand-built fixtures in every language and regenerate all bindings from one release artifact.

## Remaining Work and Risks

No assigned implementation remains. Generated WASM packages, bundles, certificates, service data, and local benchmark scratch output are intentionally ignored. The principal residual risks are synthetic membership, force-write mode, a local single-process service, and lack of production authentication/retry semantics. A future workstream should evaluate production membership and read-to-write lifecycle behavior before comparing Routerlicious or ODSP, and should add offered-load, CPU, memory, and packet-level measurements before making capacity claims.
