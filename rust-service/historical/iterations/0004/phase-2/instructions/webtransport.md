# Iteration 0004: webtransport Instructions

Status: planned
Branch: `rust-service-iteration-0004-webtransport`
Iteration source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Owner: GitHub Copilot WebTransport coding agent
Report: `rust-service/iterations/0004/phase-2/webtransport.md`

## Assignment

Implement a native-only WebTransport server plus native Rust and browser-WASM clients over reliable bidirectional streams. Use `wtransport` for native targets and browser `WebTransport` through `web-sys`/`wasm-bindgen`; share protocol bytes, not transport code. Hypothesis: both clients preserve finite reads, explicit reconnect, stable errors, and opaque resume tokens against one server. Disprove it with native and headless-browser reconnect traces requiring different protocol semantics. Datagrams, WebSocket fallback, auth, and production certificate automation are excluded.

## Ownership

- Wave 2 implementation waits for the coordinator to provide the integrated service protocol commit; dependency audit and harness planning may start earlier.
- Writable: new native/browser transport crates under `rust-service/crates/wrappers/`, browser assets under `rust-service/tests/webtransport-browser/`, and `rust-service/iterations/0004/phase-2/webtransport.md`.
- Keep native QUIC/TLS and browser bindings in separate crates or target-specific dependency sections. The shared protocol must import neither stack.
- Do not commit root workspace membership or lockfile. Core, durable, sequencer, Unix transport, and protocol semantics are read-only.

## Expected Evidence

- Native server/native client and browser-WASM client interoperate for create/open, append/read, snapshots, malformed tokens, disconnect, and explicit reconnect.
- Deterministic development-certificate setup without committed private keys; document browser trust/hostname requirements.
- Wire-byte, reconnect-latency, and queue-peak observations for one equivalent payload, with TLS/QUIC overhead distinguished from Unix framing.
- Report dependency/tool versions, target boundaries, browser matrix actually tested, failures, and commits.

## Validation

Print checkout identity and prerequisite commit. In an exact disposable copy, run native focused tests and strict Clippy, `cargo check --target wasm32-unknown-unknown`, WASM binding generation, headless Chromium behavior, and `cargo fmt --all -- --check` with isolated build outputs. Verify the assigned worktree has no root manifest/lockfile diff. Record exact browser/tool versions and do not accept output from another checkout.

## Escalation and Stopping Conditions

Stop if the browser passes only with an insecure bypass, native and browser adapters need divergent semantics, queues are unbounded, reconnect becomes implicit, or shared APIs must change. Preserve the smallest handshake/frame/resume counterexample. A native-only implementation is partial evidence, not completion.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
