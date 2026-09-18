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
