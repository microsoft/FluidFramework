# Iteration 0004 Phase 3 Report

Status: complete
Phase 2 integration commit: `3f60dd19df183cec1295c84c0ca8e4c7f48489b3`
Phase 3 commit: final record commit containing this file; its hash becomes the iteration `0005` source

## Evidence Summary

- Service assembly was supported without a kernel change. FSP4, the durable log, the same-host fence, and the authoritative sequencer passed create/open, submit, snapshot, restart, recovery, and stale-session traces.
- Native and browser-WASM WebTransport clients exchanged unchanged FSP4 frames. Native and Chromium reconnect/resume traces passed with certificate hash pinning and no insecure browser flags.
- The native lifecycle kept reconnect, replay, regeneration, and abandonment explicit. It exposed rather than hid the remaining live `RecoveryRequired` limitation.
- Encryption passed authenticated-encryption, key rotation, wrong-key, corruption, and composition checks with 51 bytes of payload overhead.
- Immutable-dictionary compression preserved arbitrary resume and retention independence. Adaptive predecessor state was rejected; repeated data improved while incompressible data expanded.
- The 26-cell, 130-run matrix produced stable throughput and persisted-size observations for most cells. Very short startup, read, and reconnect timings remained noisy and are not rankings.
- Final native workspace validation passed formatting, strict Clippy, build, 127 tests with three intentional ignores, and the recovering counter example.

## Implementation Defects

Integration corrected a protocol decoder return mismatch, split an oversized service handler, replaced two wildcard test matches, and made benchmark workspace registration idempotent. All corrections are committed and the final gate passed. No known local defect remains in the accepted iteration scope.

## Shared Abstraction Findings

- The kernel contracts remained sufficient; no iteration `0004` result justifies changing `AppendStream`, `SnapshotStore`, or `PositionCodec`.
- Canonical reads are a storage/sequencer surface, not a usable Fluid history API. Projection belongs in `fluid-sequencer`, where FSQ2 decoding and administrative-record filtering can remain authoritative.
- The sequencer can resolve an ambiguous storage append internally, but FSP4 cannot request that resolution from a live service. This is a shared protocol limitation, not a reason for hidden client retry.
- A non-`Send` fence guard preserves the accepted same-host correctness boundary but keeps the current WebTransport service serial. Concurrency remains deferred.
- Compression before encryption composes without kernel exceptions. Dictionary and key provisioning remain application or deployment policy.
- Browser transport behavior requires a real browser, while protocol, lifecycle, projection, and blob client logic can be tested in Node when the WASM package accepts an injected transport.

## Decisions

- [Decision 0007](../../decisions/0007-projected-reads-and-ambiguity-recovery.md) accepts sequencer-owned projected reads and explicit live ambiguity recovery for iteration `0005`.
- [Decision 0008](../../decisions/0008-portable-wasm-client-boundary.md) accepts an environment-neutral WASM client core with an injected transport and a browser WebTransport adapter.
- [Decision 0006](../../decisions/0006-scoped-deployment-boundaries.md) remains controlling for deployment claims. Decisions 0001-0005 remain accepted.

## Comparative Results

- Equivalent five-run file workloads produced throughput CVs of 0.50% for the buffered file baseline and at most 5.40% for 21 of 26 integrated cells. Startup/read/reconnect cells with high variance remain observations only.
- Encryption adds a fixed 51-byte payload envelope. Immutable-dictionary compression reduced the seeded repeated workload to 42.4% of plaintext but expanded the seeded incompressible workload to 123.4%; it is therefore optional and workload-dependent.
- Native and browser adapters preserve the same FSP4 semantics, but their byte and timing counters are not transport-cost comparisons: browser APIs omit QUIC/TLS/IP and queue metrics.
- The browser release WASM was 131,430 bytes before HTTP compression. Rust, browser, crypto, and compression dependency costs are recorded in their workstream reports rather than combined into a misleading ranking.

## Learning and Process Findings

[The retrospective](retrospective.md) records wrong-worktree validation, stale generated provenance, protocol compile repairs, browser cleanup, benchmark-assumption corrections, and the rejected adaptive-compression path. Durable findings are promoted to [LEARNINGS.md](../../LEARNINGS.md).

## Skill Changes

[The skill review](skill-review.md) accepts the user-provided read-only `rust-service-status-report` skill. Commit `df046182256` adds a bounded collector that discovers iteration worktrees, reports Git/report/process evidence, and avoids disturbing active agents. Syntax and an iteration `0004` summary were validated after integration.

## Next Iteration Scope

The user approved four iteration `0005` deliverables with dependency waves:

1. `projected-reads-ambiguity-recovery`: sequencer-owned accepted-operation projection and explicit FSP4 resolution of live ambiguous submissions.
2. `content-addressed-blobs-summaries`: durable content-addressed upload/fetch, integrity validation, and atomic summary references.
3. `browser-wasm-client-package`: an environment-neutral WASM client core tested in Node through an injected transport, plus authoritative Chromium WebTransport integration.
4. `minimal-typescript-fluid-driver`: a real Fluid driver and browser vertical slice after the first three contracts are integrated.

Wave 1 runs projected reads/recovery, blob core work, and browser package groundwork concurrently. Blob FSP4 integration follows the projected-protocol prerequisite; the browser package then consumes both protocol capabilities. The driver is Wave 3 and does not claim meaningful completion before all three prerequisites are available.

Retention/GC, direct SharedTree integration, service concurrency, browser storage, distributed fencing, hardware power-loss qualification, cloud blob stores, authentication, and broad optimization remain deferred.

## Convergence Assessment

Iteration `0004` converged for its declared single-host prototype scope: promised capabilities passed applicable tests, limitations are documented, no accepted implementation relies on a hidden retry or undocumented kernel exception, and negative/noisy measurements remain visible. The overall project has not reached final convergence because projected Fluid reads, live ambiguity recovery, blobs/summaries, a consumable browser package, and a minimal Fluid driver are still justified adjustments. Iteration `0005` targets those product-facing gaps without reopening the kernel.
