# Iteration 0005: browser-wasm-client-package Instructions

Status: planned
Branch: `rust-service-iteration-0005-browser-wasm-client-package`
Iteration source commit: `2de3d94f89ecff3e340eb1d580d628d5d951681b`
Owner: assigned iteration `0005` implementation agent
Report: `rust-service/iterations/0005/phase-2/browser-wasm-client-package.md`

## Assignment

Implement [Decision 0008](../../../../decisions/0008-portable-wasm-client-boundary.md). Hypothesis: the built WASM package can expose one lifecycle/protocol API that passes deterministic Node tests through an injected asynchronous request transport and unchanged Chromium WebTransport tests. Disprove first by running the same malformed-frame, request-id, disconnect, and reconnect cases in Node and Chromium and observing divergent public outcomes.

## Ownership

Wave 1 writable: `crates/wrappers/webtransport-browser`, browser binding/package and test-harness paths, a new environment-neutral WASM client module/crate if justified, and this report. Shared protocol/service/client semantics remain read-only. After coordinator handoffs, consume projected read/recovery and blob/summary APIs without redefining them. Integration owns root registration and lockfiles. Do not require a Node WebTransport polyfill, hide reconnect/retry, or replace real-browser evidence with mocks.

## Expected Evidence

Deliver a documented TypeScript-facing package, injected transport contract, deterministic Node tests loading the actual built WASM, and browser WebTransport adapter composition. Cover malformed/oversized frames, mismatched request IDs, lifecycle transitions, cancellation, shutdown, bounded queues, projected resume, ambiguity recovery, and blob/summary APIs when prerequisites arrive. Retain a fresh Chromium trace with certificate pinning and record bundle size and copies at the JS/WASM boundary where measurable.

## Validation

Print absolute checkout, branch, and HEAD. Run Rust format and strict Clippy, `wasm32-unknown-unknown` Clippy/build, binding and package generation, repository-standard JavaScript/TypeScript format/lint/typecheck, Node package tests, and a fresh headless Chromium trace against the native service without insecure flags. Use an isolated target and exact disposable copy when root registration is unavailable; verify root manifest/lockfile immediately. Finish with clean Git status and exact Node/browser evidence.

## Escalation and Stopping Conditions

Stop if mocks bypass actual framing or lifecycle code, browser-only globals enter the environment-neutral core, Node and Chromium require divergent protocol semantics, queues become unbounded, or the public API cannot consume prerequisite handoffs without copying policy. Preserve the smallest same-case Node/browser divergence and escalate shared API changes.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
