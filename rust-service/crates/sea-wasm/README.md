# Sea WASM Bindings

This crate is the shared session-binding foundation for browser and Node.js consumers.
It is under construction as part of the combined stages 1 and 2 in the [integration plan](../../SERVICE_CLIENT_PLAN.md).
Existing consumers still use the bindings in `sea-webtransport` until migration is complete.

The transport-independent session adapter preserves concrete availability handles while hiding their implementation types.
Storage, transport, and decorator construction remain separate from session operations.
Errors retain their SEA classification, and snapshot publication delegates to the original session with its original handles.
Handles from incompatible implementations are rejected rather than converted into availability claims.

Cargo features select optional dependencies: `memory`, `webtransport`, and `compression`.
Default features are empty.
A memory-only build does not depend on `sea-webtransport`; a WebTransport-only build does not depend on local storage, sequencers, or payload decorators.

From `rust-service/`, validate the adapter with:

```bash
cargo test -p sea-wasm --features memory,compression
cargo check -p sea-wasm --no-default-features --features memory --target wasm32-unknown-unknown
```

Use the workspace's browser compiler flags when enabling `webtransport` for WASM.
The [development guide](../../DEVELOPMENT.md) defines the workspace validation gates.