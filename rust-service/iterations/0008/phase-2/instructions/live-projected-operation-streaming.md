# Iteration 0008: live-projected-operation-streaming Instructions

Status: planned
Branch: `rust-service-iteration-0008-live-projected-operation-streaming`
Iteration source commit: `4dd96bf3178264eb48fb4a1d23ca32b5102a193e`
Owner: GitHub Copilot implementation agent
Report: `rust-service/iterations/0008/phase-2/live-projected-operation-streaming.md`

## Assignment

Replace projected-read polling with a long-lived projected-operation subscription across the Rust protocol/service, native WebTransport wrapper, generated browser WASM client, and minimal Fluid driver. Hypothesis: one bounded cancellable subscription can atomically catch up from an opaque cursor and tail every operation exactly once and in order, resume without hidden retry, and terminate under native shutdown policy. Disprove first with the A/B/C boundary race, resume-after-B, slow-consumer, and shutdown checks from the charter. Keep summaries/storage request/response, DDS payloads opaque, and ambiguity recovery explicit.

## Ownership

Writable: `rust-service/crates/protocol/**`, `rust-service/crates/service/**`, `rust-service/crates/wrappers/webtransport-native/**`, `rust-service/crates/wrappers/webtransport-browser/**`, focused `rust-service/tests/**`, `rust-service/tests/minimal-fluid-driver/**`, this workstream report, and a streaming decision record if accepted.

Read-only: kernel stream crates, durable log, authoritative sequencer append semantics, content-addressed storage, root manifests/lockfiles, accepted decisions, and prior iteration records. Do not decode DDS payloads, expose canonical positions, retry silently, detach tasks, use unbounded channels, weaken fencing/shutdown limits, add production membership, or substitute polling.

## Expected Evidence

- A documented versioned subscribe request and repeated projected operation/cursor events with hard frame/queue limits and terminal cancellation/error disposition.
- Atomic catch-up/tail service tests covering the transition race, exact ordering, duplicate suppression, gap detection, resume cursor, slow-consumer behavior, malformed/oversized frames, terminal errors, and shutdown.
- Native ownership and bounded backpressure integrated with immediate cancellation and drain.
- Serialized browser WASM subscribe/cancel API and a push-driven Fluid delta connection preserving replacement, recovery, deterministic history envelopes, and cold replay.
- Real Chromium default-lifecycle evidence with no explicit synchronization loop for live convergence.
- Clean benchmark evidence comparing committed pre-streaming Rust, post-streaming Rust, and Tinylicious with every sample, distributions, wire bytes, peak frame/queue depth, and resume measurements. No predetermined speedup is required.

## Validation

Print absolute worktree, branch, and HEAD with delegated results. Run focused crate tests after each edit, then Rust workspace format/Clippy/build/test/example. Generate fresh Node/web WASM with unstable web APIs and run generated-WASM tests plus TypeScript format/lint/typechecks/build/bundles. Run native and Chromium streaming/shutdown traces without insecure flags. Use nvm Node `22.23.2` for constrained builds and validated Node 24 for benchmark orchestration. Run the deterministic benchmark from a clean committed source. Finish with `git diff --check` and immediate proof that root Cargo/pnpm lockfiles are unchanged.

## Escalation and Stopping Conditions

Stop with a minimized test if atomic catch-up/tail requires canonical append changes, `wtransport` cannot cancel boundedly without detached tasks, backpressure needs an unbounded buffer, cursor resume cannot distinguish gaps/duplicates, or production membership is required. Retain useful protocol/service boundary tests and report the missing primitive. Do not present polling as streaming or benchmark incomparable semantics as a speedup.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
