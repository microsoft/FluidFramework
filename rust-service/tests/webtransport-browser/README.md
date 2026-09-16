# WebTransport browser validation

This harness runs the generated `SeaBrowserTransport` against the native HTTP/3 server without disabling certificate validation.
The generated ECDSA P-256 certificate is valid for 13 days and the client pins its SHA-256 digest.
Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run all Cargo commands from `rust-service/` with isolated `CARGO_TARGET_DIR` values. The required crates are registered in the workspace; validation must leave the root manifest and lockfile unchanged.

```bash
pnpm --dir tests/minimal-fluid-driver run build:wasm
sh tests/webtransport-browser/generate-cert.sh tests/webtransport-browser/.certs
cargo run -p sea-webtransport-server -- \
  127.0.0.1:0 tests/webtransport-browser/.certs/cert.pem \
  tests/webtransport-browser/.certs/key.pem tests/webtransport-browser/artifacts/service-data
node tests/webtransport-browser/run-headless.mjs tests/webtransport-browser \
  https://127.0.0.1:<printed-port>/sea \
  "$(cat tests/webtransport-browser/.certs/cert.sha256)"
```

The browser flow exercises archive/session operations, multiple ordered submissions on one event-author stream, gap-free load, live events, blob and directory round trips, snapshots, explicit disconnect, and reconnect against the native service.

Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not infer unavailable network measurements.
