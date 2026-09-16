# Sea WebTransport

This crate owns the bounded, versioned Sea v1 protocol, server dispatch, and native WebTransport client/server transport.
Its `sea-webtransport-browser` WASM example generates the web and Node bindings used by browser, injected-transport, and process-local clients.

`WebTransportServer` accepts sessions only on `/sea`, bounds concurrent connections and streams, and dispatches requests to an archive-bound `SeaSession`.
Unary requests require request-side EOF before dispatch.
Streaming responses use four-byte length framing and terminate on cancellation, service closure, or write failure.

`WebTransportClient` pins a SHA-256 certificate hash and implements `SeaSession`.
Disconnect and reconnect are explicit; operations are never retried automatically.
The protocol uses `SEA1` magic, version 1, postcard payloads, and a configured maximum frame size.

Server shutdown first stops acceptance. `Immediate` cancels owned connections; `Drain` allows existing connections to finish until its deadline and then cancels the remainder. The returned `ShutdownOutcome` records which path completed.

Run from `rust-service/`:

```bash
cargo test -p sea-webtransport --all-targets --all-features
cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-webtransport --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../tests/webtransport-browser/README.md).
