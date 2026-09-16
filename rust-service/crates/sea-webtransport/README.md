# Sea WebTransport

This crate owns the bounded, versioned Sea protocol, shared client state machines, native and browser transport primitives, and native WebTransport client.
Its `sea-webtransport-browser` WASM example generates the web and Node bindings used by browser, injected-transport, and process-local clients.

The native listener, server dispatch, archive routing, connection measurements, and shutdown policy belong to `sea-webtransport-server`.
The event stream opens the logical session, returns an opaque authority, and carries recovery plus live events.
The authority binds one ordered author stream carrying submissions, resolution requests, and acknowledgements without per-operation stream creation.
Native and browser clients use the same frame codec, correlation, lifecycle, event-stream, and author-stream state machines.
Protocol or transport failure closes the owning connection without terminating the server endpoint.

`NativeSeaClient` pins a SHA-256 certificate hash and implements `SeaSession`.
Disconnect and reconnect are explicit; operations are never retried automatically.
The current network envelope uses explicit message-kind and correlation fields with typed postcard payloads and a configured maximum frame size.
The temporary old `SEA1` path remains only until checkpoint 6f.

Run from `rust-service/`:

```bash
cargo test -p sea-webtransport --all-targets --all-features
cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-webtransport --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../tests/webtransport-browser/README.md).
