# WebTransport browser validation

This harness runs the generated `SeaBrowserTransport` against the native HTTP/3 server without disabling certificate validation.
The generated ECDSA P-256 certificate is valid for 13 days and the client pins its SHA-256 digest.
Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run the test from `rust-service/`.
The script builds the WASM client, generates a temporary certificate, starts the native server, runs the browser flow in headless Chromium, and shuts down the server.
It uses an isolated `CARGO_TARGET_DIR` and leaves the root manifest and lockfile unchanged.

```bash
tests/webtransport-browser/run-test.sh
```

The browser flow exercises archive/session operations, multiple ordered submissions on one event-author stream, gap-free load, live events, blob and directory round trips, snapshots, explicit disconnect, and reconnect against the native service.

The default flow opens snapshot coordination as `ClientSelected`.
Run the same flow with Sea-managed selection by setting `SEA_SNAPSHOT_POLICY=sea` on the script command; passing tests report `snapshotParticipation` as `3` and `2`, respectively.

Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not infer unavailable network measurements.
