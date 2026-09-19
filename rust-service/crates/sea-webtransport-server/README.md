# Sea WebTransport Server

This native-only crate owns the deployable Sea WebTransport server library and executable.
It owns listener and TLS setup, connection and stream dispatch, runtime storage selection, archive routing, measurements, and graceful shutdown.
It depends on `sea-webtransport` only for shared wire values and framing; the client crate does not depend on this server crate.

Run from `rust-service/`:

```bash
cargo run -p sea-webtransport-server -- \
	127.0.0.1:4433 cert.pem key.pem ./sea-data
```

Set `SEA_STORAGE_MODE` to `memory`, `buffered-file`, or `durable-file`.
The default is `durable-file`.
An optional fifth argument is a shutdown-marker path used by process harnesses.

On startup the process prints `WEBTRANSPORT_URL`, `CERTIFICATE_SHA256`, `STORAGE_MODE`, and `PROTOCOL=sea`.
Clients connect to the printed `/sea` URL and pin the printed SHA-256 certificate digest.
It also prints the configured QUIC heartbeat interval, inactivity timeout, author reconnect grace, and live-event lag limit.
Heartbeat uses QUIC PING frames; a peer is responsive when QUIC receives authenticated traffic before the inactivity timeout.
Connection loss immediately removes snapshot participation, then releases author membership after reconnect grace.
Snapshot-stream loss also immediately removes that stream's publisher participation while leaving the connection available for other logical streams.
Read-only streams cannot publish; client-selected streams retain application-managed election; Sea-selected streams receive a deterministic fence only while no client-selected publisher is active.

## Optional WebSocket Listener

Compile with the off-by-default `websocket-stream` feature and explicitly configure a separate TCP listener:

```bash
SEA_WEBSOCKET_BIND=127.0.0.1:8081 \
SEA_WEBSOCKET_ORIGINS=http://localhost:8080 \
cargo run -p sea-webtransport-server --features websocket-stream -- \
	127.0.0.1:4433 cert.pem key.pem ./sea-data
```

Merely compiling the feature does not open another listener.
`SEA_WEBSOCKET_ORIGINS` is a comma-separated, exact backend-visible Origin allowlist; empty entries and `*` are rejected.
Missing Origin is rejected by default.
For direct local Node tests only, set `SEA_WEBSOCKET_ORIGINLESS_LOOPBACK=1` (or call `with_originless_loopback_clients` before serving).
This requires a loopback-bound listener and loopback peer, and permits only an absent header; any present Origin, including `null`, must still match the allowlist.
The setting accepts only `0` or `1` and defaults to disabled.
A local forwarding proxy also appears as a loopback peer, so do not enable this exception on a forwarded/public endpoint; it is not authentication.
The binary keeps its existing QUIC arguments and prints `WEBSOCKET_URL` when the optional listener is enabled.
Both listeners share one `BuiltInSeaHost`, so they can collaborate on the same documents and coordinate shutdown.
Custom hosts can bind `WebSocketServer` directly without starting QUIC or loading a QUIC certificate.

The listener speaks plain HTTP WebSocket upgrades at `/sea/websocket`, using subprotocol `sea-stream-v1`.
Native `WebSocketStream` and explicitly selected ordinary WebSocket clients use this same protocol and grouping.
Ordinary clients enable Node and broader browser compatibility but cannot propagate application receive demand to the network.
Their adapter queue fails on overflow; bounded server buffers do not provide a total memory bound for those clients or intermediaries.
Put it behind a trusted TLS/authenticating proxy for remote `wss:` use.
Codespaces forwarding provides TLS, but can rewrite Origin to `http://localhost:<listener-port>`; configure the observed backend value, not a wildcard.
An Origin check and the random child-association token are not user authentication.
Public exposure permits untrusted callers; use disposable data for development tests and restore private port visibility afterward.
Do not expose retained or sensitive data through an unauthenticated public port.

A control socket creates one dispatcher and receives an opaque, random 256-bit association token.
Each logical stream opens its own socket at `/sea/websocket/<token>`; avoid logging these token-bearing paths.
Loss of the control connection removes the token, cancels children, and calls dispatcher cleanup exactly once.
Control ping/pong uses the configured heartbeat and inactivity policy, independently of data-stream backpressure.
Group and stream counts use `TransportConfig` limits, with a bounded total of active socket tasks and timed upgrades.
Limits and measurement handles are per listener, not combined across QUIC and WebSocket listeners.
The existing drain policy stops acceptance, lets admitted work proceed until its deadline, then cancels groups and releases membership without reconnect grace.

Server messages are capped at 64 KiB of DATA plus one tag byte, with a one-record receive queue and bounded write buffering per stream.
FIN closes only the sender's direction; premature socket close, invalid tags, text on data sockets, and oversized messages fail the stream.
Shared request handlers depend on a private byte-stream interface, not WebSocket-specific branching.

Focused listener and stream tests:

```bash
cargo test -p sea-webtransport-server --features websocket-stream websocket
```

## Document Ownership

The host uses the replacement `SeaStorage` factories and `LocalSequencer` directly.
Creation allocates an opaque backend document ID and returns it with session authority; callers retain that ID for reopening.
No caller-name mapping is maintained.
File modes keep their namespace below `root/documents`.

A host serializes lazy factory initialization and first document recovery.
Concurrent sessions for one document share one recovered runtime and its exclusive view; failed initialization is not cached and can be retried explicitly.
The registry retains successful runtimes for the host lifetime, with no idle eviction.
Dropping the host and its connections releases those views; stopping the listener alone does not evict a separately retained host.
Live replay uses backend monitored streams rather than the obsolete sequencer broadcast buffer; the legacy liveness lag setting does not bound this replay path.

Snapshot dispatch resolves wire roots and committed event positions through the session before constructing availability handles.
Snapshots are versioned by event position, not publication-operation IDs.
Each snapshot stream owns its own registration lease, so cleanup of an older stream cannot revoke its replacement.
An explicit snapshot `Close` acknowledges and ends that transport stream; lease drop, not session-wide revocation, releases its registration.

Focused host tests cover shared first-open ownership, retry after failed initialization, backend-assigned IDs, native round trips across all three storage modes, authority checks, snapshot replacement, malformed streams, acknowledgement loss, and shutdown.

Cross-crate decorator composition, including repeated WebTransport hops, is tested in [`sea-integration-tests`](../sea-integration-tests/README.md).
