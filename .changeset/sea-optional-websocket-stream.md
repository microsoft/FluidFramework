---
"@fluidframework/sea-typescript": minor
"__section": feature
"__includeInReleaseNotes": false
---
Add optional streaming and ordinary WebSocket development transports for SEA

The experimental Rust SEA client and server support an off-by-default `websocket-stream` feature for browser environments where QUIC is unreachable, including Codespaces TCP forwarding.
The native `WebSocketStream` adapter preserves independent logical-stream backpressure, and existing strict modes never silently substitute ordinary WebSocket.
New `WebSocket` and `PreferAvailable` modes explicitly permit ordinary WebSocket for Node's built-in client and browsers without streaming transports, with no extra npm dependency.
Ordinary WebSocket cannot provide receive backpressure: its adapter queue is capped per socket at 4 MiB and 256 messages, and overflow fails the stream instead of dropping bytes.
Uploads use `bufferedAmount` throttling; these limits do not bound runtime, kernel, or proxy buffering.
Fallback is explicit and limited to initial establishment; no SEA operations are replayed.

```bash
node packages/sea-typescript/scripts/build-wasm.mjs websocket
```

Configure `SEA_WEBSOCKET_BIND` and `SEA_WEBSOCKET_ORIGINS` when running the feature-enabled server behind a trusted TLS proxy.
Applications use the internal `openRemote` factory from `@fluidframework/sea-typescript/internal/websocket`, with explicit mode and endpoint options.
The socket-capable artifact is isolated from the existing minimal WebTransport and memory artifacts; the legacy generated session API remains removed.
Node's originless built-in client requires `SEA_WEBSOCKET_ORIGINLESS_LOOPBACK=1` for direct loopback testing only; present Origin headers still require an allowlist match.
Keep this default-off exception disabled on forwarded/public endpoints.
Public forwarding is not authentication; use disposable development data or an authenticated host.