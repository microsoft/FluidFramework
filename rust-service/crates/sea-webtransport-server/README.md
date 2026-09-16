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
Connection loss immediately revokes snapshot nomination, then releases author membership after reconnect grace.
