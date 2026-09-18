# Iteration 0011: transport-client-quality Instructions

Status: active
Branch: `rust-service-iteration-0011-transport-client-quality`
Iteration source commit: `0d2c7e367767978b267831ca34aba6e398948bdf`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0011/phase-2/transport-client-quality.md`

## Assignment

Audit native/client facades, network wrappers, native-service browser bindings, and native/browser WebTransport for connection and stream lifecycle correctness, backpressure, malformed frames, cancellation, shutdown, and binding accuracy. Focus on the newly added ordered submission stream and one-shot EOF distinction. Hypothesis: deterministic transport and browser tests can close recent lifecycle gaps without protocol or browser API redesign.

## Ownership

Writable: `rust-service/crates/client/`, `wrappers/network/`, `wrappers/native-service-browser/`, `wrappers/webtransport-browser/`, `wrappers/webtransport-native/`, `tests/wasm-client/`, `tests/webtransport-browser/`, and this report. Read-only: protocol/service, Fluid driver, root manifests/lockfiles, and generated evidence. Generated bindings may be refreshed from owned Rust sources but must not be hand-edited. Do not change wire semantics or request kinds.

## Expected Evidence

- Lifecycle-to-test inventory for connect, reconnect, close, cancellation, partial frames, EOF, backpressure, ordered submission responses, and graceful shutdown.
- Fault tests for the highest-risk missing cases, including mid-stream closure and response/error ordering where feasible.
- Fresh WASM/native builds, binding generation, Node/browser execution, and local operational docs.
- Regression-backed fixes only, preserving protocol and public behavior.

## Validation

Print checkout identity plus Rust, wasm-bindgen, Node, and browser versions. Run formatting; strict host Clippy/tests for owned native crates; `RUSTFLAGS='--cfg=web_sys_unstable_apis'` strict WASM Clippy/build; fresh generated bindings; wasm-client tests; and headless WebTransport tests without insecure browser flags. Run `git diff --check` and verify lockfiles are unchanged.

## Escalation and Stopping Conditions

Stop before protocol/wire changes, public browser API redesign, new dependencies, or Fluid-driver edits. Report browser/platform-only failures with exact versions and preserve minimized native coverage. Escalate any ambiguous-submission semantic change.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
