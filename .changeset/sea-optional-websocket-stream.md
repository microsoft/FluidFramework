---
"__section": feature
"__includeInReleaseNotes": false
---
Add an optional native WebSocketStream development transport for SEA

The experimental Rust SEA client and server support an off-by-default `websocket-stream` feature for browser environments where QUIC is unreachable, including Codespaces TCP forwarding.
The adapter requires native browser `WebSocketStream`, preserves independent logical-stream backpressure, and never silently substitutes ordinary WebSocket.
Fallback is explicit and limited to initial establishment; no SEA operations are replayed.

```bash
SEA_WEBSOCKET_STREAM=1 node crates/sea-webtransport/scripts/build-wasm.mjs
```

Configure `SEA_WEBSOCKET_BIND` and `SEA_WEBSOCKET_ORIGINS` when running the feature-enabled server behind a trusted TLS proxy.
Public forwarding is not authentication; use disposable development data or an authenticated host.