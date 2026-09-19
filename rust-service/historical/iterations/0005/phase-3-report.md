# Iteration 0005 Phase 3 Report

Status: complete
Phase 2 integration commit: `36a56f07607d9bfce97fdda1f0661eff7bc676dc`
Phase 3 commit: final record commit containing this file; its hash becomes the iteration `0006` source

## Evidence Summary

- Sequencer-owned projection advanced across administrative records without exposing FSQ2, and explicit ambiguity resolution distinguished committed, absent, and uncertain outcomes without appending or retrying.
- SHA-256 blobs and immutable summary manifests passed bounded streaming, interruption, corruption, lost-acknowledgement, and process-restart checks. No acknowledged manifest exposed a missing or corrupt reference.
- One environment-neutral WASM core passed 12 actual-WASM Node tests through injected transports and an authoritative Chromium WebTransport trace through the browser adapter.
- The minimal TypeScript driver implemented the selected Fluid interfaces and passed three actual-WASM Node contracts plus a Chromium create/load/submit/history/summary/recovery trace. Two logical clients worked over one transport session; the stronger independent two-session browser check was inconclusive because the native server serializes accepted connections.
- Final integration validation passed formatting, strict Clippy, all-target build, 146 top-level Rust tests with four intentional ignores, 15 actual-WASM Node tests across both packages, both Chromium traces, and the recovering counter example.

## Implementation Defects

The workstreams corrected a projection fixture ordering error, a stale client queue after explicit recovery, process-test resource collisions, strict-Clippy findings, and stale generated WASM bindings. The final integrated gate passed. No known local defect remains in the accepted iteration scope.

## Shared Abstraction Findings

- The kernel contracts remained sufficient. Projection, resolution, blobs, summaries, packaging, and the driver composed above them without changing `AppendStream`, `SnapshotStore`, or `PositionCodec`.
- FSP4 version `1` accepted additive request kinds `8` through `13` and response kinds `68` through `73`; existing wire kinds remained stable.
- Accepted-operation projection belongs in the sequencer. Empty projected pages may advance an opaque cursor across bounded administrative spans without leaking canonical framing.
- Ambiguous submission recovery is an authoritative query followed by caller-owned retry only after `NotCommitted`; neither native nor WASM clients need hidden replay.
- Content-addressed persistence can acknowledge immutable manifests safely before retention exists when every reference is verified and publication is atomic. Retention, garbage collection, multi-process writers, and objects above the bounded whole-frame transfer limit remain unsupported.
- Injected Node transports are sufficient for deterministic portable client logic but not evidence for browser WebTransport. Real Chromium remains authoritative for certificates, streams, reconnect, and browser globals.
- The minimal Fluid driver boundary is viable without FSQ2 decoding. It is intentionally incomplete and does not imply Routerlicious, ODSP, signals, automatic live tail, incremental summaries, authentication, or GC support.
- Independent browser transport sessions remain inconclusive. The native server's serial accept loop is a shared implementation limitation, not a protocol or driver defect.

## Decisions

- [Decision 0007](../../decisions/0007-projected-reads-and-ambiguity-recovery.md) is implemented and remains accepted.
- [Decision 0008](../../decisions/0008-portable-wasm-client-boundary.md) is implemented and remains accepted.
- [Decision 0006](../../decisions/0006-scoped-deployment-boundaries.md) still controls deployment claims. Decisions 0001-0005 remain accepted.
- No new shared semantic decision is required. Native connection concurrency must preserve the existing fencing and single-host deployment boundaries.

## Comparative Results

- Projected and resolution FSP4 fixtures measured 43/114 and 67/42 bytes for request/response pairs. Correctness, not replay indexing performance, was the iteration target.
- Content persistence retained 1.0x payload size for measured blobs, used a bounded 64 KiB copy buffer, and stored a two-entry manifest in 94 bytes. FSP4 whole-object transfer remains capped at 512 KiB by default.
- The final generated WASM was 293,007 bytes; Node and browser packages were 349,636 and 359,761 bytes including loaders and declarations. These are package-size observations, not transport comparisons.
- Chromium content operations used 552 of 2,129 FSP4 bytes with a 363-byte peak response. The driver trace used 4,438 FSP4 bytes with a 655-byte peak response and 433.6 ms startup. Browser APIs do not expose total QUIC/TLS traffic.
- Node and Chromium exercise the same WASM core but different transports, so their timings are not ranked against each other.

## Learning and Process Findings

[The retrospective](retrospective.md) records wrong-worktree command summaries, stale Cargo and generated-WASM artifacts, missing generated Fluid declarations, process-test collisions, and the early two-session browser failure. Durable findings are promoted to [LEARNINGS.md](../../../LEARNINGS.md).

## Skill Changes

[The skill review](skill-review.md) defers a general validation-isolation helper and a prerequisite-capability probe until their interfaces stabilize. No skill or coordination-script change is applied in this phase.

## Next Iteration Scope

The user accepted iteration `0005` with independent two-session Chromium support explicitly inconclusive and approved two dependency-ordered iteration `0006` workstreams:

1. `native-connection-concurrency`: preserve fencing, shutdown, and per-session lifecycle while accepting independent native and browser WebTransport sessions concurrently; prove two certificate-pinned browser clients before handoff.
2. `direct-shared-tree-integration`: after the concurrency handoff, run a real SharedTree/Fluid container through the minimal driver with two independent browser sessions, bounded history, summary reload, disconnect, explicit resolution, and caller-owned resubmission.

The second workstream may inspect interfaces and prepare fixtures in Wave 1 but must not claim integration before the first prerequisite is accepted. Retention/GC, browser storage, distributed fencing, hardware power-loss qualification, cloud blob storage, authentication/authorization, Node WebTransport, production packaging, and broad optimization remain deferred.

## Convergence Assessment

Iteration `0005` converged for its declared product-facing vertical slice: all accepted contracts have executable evidence, final integration is clean, no hidden retry or private FSQ2 decoder remains, and unsupported Fluid behavior is explicit. The overall project has not reached final convergence because independent browser sessions and a real SharedTree consumer are still missing. Iteration `0006` targets those gaps without reopening the kernel or broadening deployment claims.
