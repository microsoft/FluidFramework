# Sea WebTransport

This crate owns the bounded, versioned Sea protocol, shared frame codec, and native WebTransport client.
Its `sea-webtransport-browser` WASM example generates the web and Node bindings used by browser, injected-transport, and process-local clients.

The native listener, server dispatch, archive routing, connection measurements, and shutdown policy belong to `sea-webtransport-server`.
Unary requests require request-side EOF before dispatch.
Streaming responses use four-byte length framing and terminate on cancellation, service closure, or write failure.
The browser binding also opens an ordered event-author stream identified by `SEAS`.
Each request and receipt on that stream uses the same four-byte length framing, allowing one bidirectional WebTransport stream to carry multiple submissions without a stream-open round trip per event.
Protocol or transport failure closes the owning connection without terminating the server endpoint.

`WebTransportClient` pins a SHA-256 certificate hash and implements `SeaSession`.
Disconnect and reconnect are explicit; operations are never retried automatically.
The protocol uses `SEA1` magic, version 1, postcard payloads, and a configured maximum frame size.

Run from `rust-service/`:

```bash
cargo test -p sea-webtransport --all-targets --all-features
cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-webtransport --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../tests/webtransport-browser/README.md).
