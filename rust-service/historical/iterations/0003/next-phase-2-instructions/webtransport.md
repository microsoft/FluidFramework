# Iteration 0004: webtransport Instructions

Derived from iteration: 0003
Status: planned
Owner: GitHub Copilot WebTransport coding agent

## Approved Scope

Implement full client-side WebTransport for native Rust and browser WASM, with a native-only server. Reuse one transport-neutral application protocol over reliable bidirectional streams. The user explicitly requires native and browser-WASM clients and only a native server; see the [iteration 0003 Phase 3 report](../phase-3-report.md#next-iteration-scope). Datagrams, WebSocket fallback, authentication, and production certificate automation are out of scope.

## Prior Evidence

[Process transport](../phase-2/process-isolated-transport.md) established bounded framing, reconnect, snapshots, and opaque tokens. Browser WebTransport requires HTTPS/HTTP3 and exposes bidirectional streams through the browser API. Use `wtransport` for native server/client and `web-sys`/`wasm-bindgen` for the browser client; do not attempt to compile the native QUIC stack into WASM.

## Hypothesis and Discriminating Check

Hypothesis: separate native and browser transport adapters can exchange identical protocol frames with one native server while preserving finite reads, explicit reconnect, stable errors, and opaque resume tokens. The cheapest disproof is one native and one headless-browser trace against the same local TLS server where either target needs protocol-specific semantics or cannot resume after reconnect.

## Ownership and Dependencies

- Wave 2: begin implementation only after the service-assembly protocol crate is integrated. A dependency-audit/test-harness commit may start earlier without defining competing protocol bytes.
- Writable: new target-specific transport crates under `rust-service/crates/wrappers/`, browser test assets under `rust-service/tests/webtransport-browser/`, and the eventual iteration `0004` WebTransport report.
- Keep native server/client and browser-WASM dependencies in separate crates or target-specific sections. Shared protocol code must not import `wtransport`, `web-sys`, or `wasm-bindgen`.
- Crate-local manifests may change. Do not commit the shared lockfile or root member list; give exact dependency/version and target-install requests to integration.
- Core, durable, sequencer, Unix transport, and protocol semantics are read-only. Escalate a minimized counterexample before changing them.

## Deliverables and Validation

- Native server and native client interoperate over local HTTP/3/TLS; browser-WASM client performs the same create/open, append/read, snapshot, malformed-token, disconnect, and explicit reconnect cases.
- Add deterministic development-certificate setup without committing private keys. Verify hostname/certificate behavior and explicit frame/queue limits.
- Validate native crate tests and Clippy, `cargo check --target wasm32-unknown-unknown`, WASM binding generation, and headless Chromium behavior. Install missing target/tooling only through the coordinator and record versions.
- Measure wire bytes, reconnect latency, and queue peaks for an equivalent payload; do not compare unlike TLS/QUIC and Unix overhead as throughput conclusions.
- Stop if a browser requires insecure flags for the only passing path, if adapters diverge semantically, if queues become unbounded, or if reconnect becomes implicit.
