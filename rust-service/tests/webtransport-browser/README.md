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

## Optional WebSocketStream Validation

Run the same collaboration and shutdown flow against the optional native `WebSocketStream` adapter:

```bash
SEA_WEBSOCKET_STREAM=1 node crates/sea-webtransport/scripts/build-wasm.mjs
SEA_WEBSOCKET_STREAM=1 SEA_BROWSER_SKIP_BUILD=1 tests/webtransport-browser/run-test.sh
```

The feature-enabled mode also checks healthy-primary preference, explicit WebTransport-only failure, initial timeout fallback, missing-native-API rejection, and disconnection during child creation.
The default command and default generated package remain WebTransport-only.
Rebuild bindings without `SEA_WEBSOCKET_STREAM` when returning to default package validation.
Do not reuse generated packages from a different feature mode with `SEA_BROWSER_SKIP_BUILD=1`.

On 2026-09-18, Chromium 152 passed this flow locally with durable-file storage, including bounded shutdown and zero remaining connections.
On 2026-09-19 UTC, the Windows VS Code integrated browser (Chrome 148 / Electron 42) passed the real SEA collaboration flow through Codespaces public HTTPS/WSS forwarding with memory storage.
It covered document creation, three sessions, ordered/live events, blob/directory round trips, snapshots, and explicit reconnect with TLS validation enabled and no client tunnel or browser flags.
The disposable public ports were restored to private and both test listeners stopped.
The earlier synthetic probe below remains separate evidence for substantial two-way buffering and stall/recovery through the proxy; the SEA flow does not measure a global memory bound.

## Codespaces WebSocketStream Probe

The local `websocketstream-probe.mjs` server and `websocketstream-probe-client.mjs` page tested native browser backpressure through Codespaces forwarding without starting SEA.
They remain uncommitted in the isolated investigation worktree and are not part of `run-test.sh` or the implemented adapter.
See the [investigation record](../../CODESPACES_WEBTRANSPORT_PLAN.md#native-websocketstream-probe-2026-09-18) for setup, exposure limits, observed results, and cleanup.
The probe requires an existing `ws` installation supplied through `PROBE_WS_MODULE` and a browser with native `WebSocketStream`.
