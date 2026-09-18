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

The browser flow exercises backend-assigned document IDs, multiple ordered submissions on one event-author stream, gap-free load, live events, blob and directory round trips, event-position snapshots, explicit disconnect, and reconnect against the native service.
It also replaces a snapshot registration, cancels the older subscription without revoking its replacement, publishes while a notification read is pending, and wakes a cancelled notification read.
Shutdown checks prove bounded connection cleanup and rejection of new sessions after acceptance stops.

The default flow opens snapshot coordination as `ClientSelected`.
Run the same flow with Sea-managed selection by setting `SEA_SNAPSHOT_POLICY=sea` on the script command; passing tests report `snapshotParticipation` as `3` and `2`, respectively.

Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not infer unavailable network measurements.

## Codespaces WebSocketStream Probe

The local `websocketstream-probe.mjs` server and `websocketstream-probe-client.mjs` page tested native browser backpressure through Codespaces forwarding without starting SEA.
They remain uncommitted in the isolated investigation worktree, not part of this notes-only commit, `run-test.sh`, or a supported SEA transport.
See the [investigation record](../../CODESPACES_WEBTRANSPORT_PLAN.md#native-websocketstream-probe-2026-09-18) for setup, exposure limits, observed results, and cleanup.
The probe requires an existing `ws` installation supplied through `PROBE_WS_MODULE` and a browser with native `WebSocketStream`.
