# Sea WebTransport Server

This native-only package owns the deployable Sea WebTransport server executable.
It currently preserves the existing listener, TLS, storage composition, and shutdown behavior while those responsibilities move out of `sea-webtransport`.

Run from `rust-service/`:

```bash
cargo build -p sea-webtransport-server
```