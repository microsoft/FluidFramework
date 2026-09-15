# Sea network transports

This crate provides bounded transport adapters for the Sea event archive traits.

`local_transport` places a typed request queue between a `NetworkClient` and a task-owned backend. It forwards the backend's `Capabilities` unchanged, preserves error classification, bounds read buffering by the configured capacity, and reports payload/token bytes plus the peak queued-record count. Dropping or explicitly disconnecting the server terminates active readers; operations are not retried.

On Unix, the `process` module provides a process-isolated adapter over a versioned Unix-domain socket protocol. Frames use a four-byte length prefix and bounded fields. Opaque positions are wrapped with the server instance identity, length, and checksum so tokens from another server are rejected locally. `ProcessClient::connect` retries only initial socket establishment until its configured timeout; established operations never reconnect or retry. Capability negotiation occurs during connection and is then exposed through the core trait.

Run from `rust-service/`:

```bash
cargo test -p sea-network --all-targets --all-features
cargo clippy -p sea-network --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-network --no-deps
```

The process adapter and its tests require Unix-domain sockets.