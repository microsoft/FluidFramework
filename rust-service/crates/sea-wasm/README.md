# Sea WASM Bindings

This crate is the shared session-binding foundation for browser and Node.js consumers.
It owns the session exports extracted during the combined stages 1 and 2 in the [integration plan](../../SERVICE_CLIENT_PLAN.md).
Consumers use [sea-typescript](../../packages/sea-typescript/README.md), which owns generated artifacts and their loaders; `sea-webtransport` retains only transport and protocol responsibilities.

The transport-independent session adapter preserves concrete availability handles while hiding their implementation types.
Storage, transport, and decorator construction remain separate from session operations.
Errors retain their SEA classification, and snapshot publication delegates to the original session with its original handles.
Handles from incompatible implementations are rejected rather than converted into availability claims.

Cargo features select optional dependencies: `memory`, `webtransport`, `websocket-stream`, and `compression`.
The optional `websocket-stream` feature adds `openRemote`, sharing the same session adapter while selecting a fixed initial WebTransport or WebSocket transport.
It forwards the socket capability to `sea-webtransport`; neither memory-only nor minimal WebTransport builds include it.
The existing `openWebTransport` factory remains strict and never falls back.
Default features are empty.
A memory-only build does not depend on `sea-webtransport`; a WebTransport-only build does not depend on local storage, sequencers, or payload decorators.

From `rust-service/`, validate the adapter with:

```bash
cargo test -p sea-wasm --features memory,compression
cargo check -p sea-wasm --no-default-features --features memory --target wasm32-unknown-unknown
```

Use the workspace's browser compiler flags when enabling `webtransport` for WASM.
The [development guide](../../DEVELOPMENT.md) defines the workspace validation gates.