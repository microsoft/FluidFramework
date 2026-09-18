# Iteration 0006: native-connection-concurrency Instructions

Status: planned
Branch: `rust-service-iteration-0006-native-connection-concurrency`
Iteration source commit: `3a72dfe57b8f3b9ee96befd18c85616440fea8e7`
Owner: GitHub Copilot implementation agent
Report: `rust-service/iterations/0006/phase-2/native-connection-concurrency.md`

## Assignment

Implement concurrent native WebTransport connection acceptance without weakening accepted sequencing, fencing, shutdown, or per-session lifecycle semantics. Hypothesis: two certificate-pinned sessions can remain open and make independent progress while one authoritative ownership boundary still serializes replay, validation, and append correctly. Disprove first with two browser sessions held open simultaneously; both must handshake, submit, observe projected operations, reconnect explicitly, and resolve post-commit ambiguity without duplication. Distributed fencing, multi-host deployment, fallback transports, and general optimization are excluded.

## Ownership

Writable: `rust-service/crates/wrappers/webtransport-native/`, focused native/browser transport harnesses under `rust-service/tests/webtransport-browser/`, and `rust-service/iterations/0006/phase-2/native-connection-concurrency.md`. Narrow service changes are allowed only when required for a concurrency-safe authoritative ownership boundary. Read-only dependencies include kernel, sequencer, protocol, WASM client, minimal driver, root manifests, and shared lockfiles. Do not make the non-`Send` fence guard `Send`, weaken lock scope, change FSP4 bytes or kernel traits, or broaden Decision 0006 deployment claims.

## Expected Evidence

- A bounded connection-task ownership model with explicit cancellation, error handling, and shutdown.
- Deterministic native tests for simultaneous sessions, independent lifecycle, cleanup, and preserved sequencing/fencing.
- Existing single-session native and browser traces remain passing.
- A fresh two-session Chromium trace with two independent `BrowserClient` instances covering simultaneous handshake, one submission per client, projected convergence, explicit reconnect, and ambiguity resolution without hidden retry.
- Report session/client counts, FSP4 bytes, peak response, projected sequences, reconnect timing, ambiguity outcome, task bounds, and cleanup.
- A coherent implementation commit and completed report suitable for Wave 2 handoff.

## Validation

Print absolute checkout, branch, HEAD, and protected root-file status with every accepted result. Use fresh checkout-specific `CARGO_TARGET_DIR` values. Run `cargo fmt --all -- --check`; focused and workspace-relevant tests; strict host Clippy; strict `wasm32-unknown-unknown` Clippy when browser bindings are rebuilt; native and browser release builds; `wasm-bindgen 0.2.128`; existing Chromium traces; and the new two-session Chromium trace without insecure flags. Verify `rust-service/Cargo.toml`, `rust-service/Cargo.lock`, root pnpm files, WASM/driver sources, and generated package sources remain unchanged unless the coordinator explicitly grants ownership. Run `git diff --check`.

## Escalation and Stopping Conditions

Stop and escalate if correctness requires transferring the fence guard, reducing its protected interval, changing kernel/protocol semantics, hidden retry, unbounded detached tasks, or deployment claims beyond Decision 0006. Preserve a minimized failing two-session trace and any safe task-ownership experiment if the hypothesis is falsified. Do not hand off to SharedTree until independent browser sessions pass.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
