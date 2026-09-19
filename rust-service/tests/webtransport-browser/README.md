# WebTransport browser validation

This harness runs the generated `SeaBrowserTransport` against the native HTTP/3 server without disabling certificate validation.
The generated ECDSA P-256 certificate is valid for 13 days and the client pins its SHA-256 digest.
Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run the test from `rust-service/`.
The script builds the neutral package and legacy WASM client, generates a temporary certificate, starts the native server, runs both browser flows in headless Chromium, and shuts down the server.
It uses an isolated `CARGO_TARGET_DIR` and leaves the root manifest and lockfile unchanged.

```bash
tests/webtransport-browser/run-test.sh
```

The first flow uses the neutral WebTransport factory for plain and compressed sessions.
It verifies classified missing-document rejection, content references, live peer delivery, cancellation of a pending history read, snapshot notifications, latest and bounded lookup, and reopening.
An undecorated observer verifies that compression actually encodes stored bytes.
Both snapshot participation policies are supported; ordered unique session identities keep the expected SEA-selected publisher stable during the test.

The retained legacy transport flow exercises backend-assigned document IDs, multiple ordered submissions on one event-author stream, gap-free load, live events, blob and directory round trips, event-position snapshots, explicit disconnect, and reconnect against the native service.
It also replaces a snapshot registration, cancels the older subscription without revoking its replacement, publishes while a notification read is pending, and wakes a cancelled notification read.
Shutdown checks prove bounded connection cleanup and rejection of new sessions after acceptance stops.

The default flow opens snapshot coordination as `ClientSelected`.
Run both flows with Sea-managed selection by setting `SEA_SNAPSHOT_POLICY=sea` on the script command.
The neutral results report `participation` as `clientSelected` or `seaSelected`; legacy results report `snapshotParticipation` as `3` or `2`, respectively.
Validation passed with durable-file storage and client-selected publication, and with `SEA_STORAGE_MODE=memory SEA_SNAPSHOT_POLICY=sea`, using Chromium 152 inside the Codespace.
Both flows run through `rust-service/test.sh`; they do not establish external-browser connectivity through Codespaces forwarding.

Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not infer unavailable network measurements.
