# Sea WebTransport Server

This native-only package owns the deployable Sea WebTransport server executable.
It owns listener and TLS setup, runtime storage selection, archive routing, and graceful shutdown.

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