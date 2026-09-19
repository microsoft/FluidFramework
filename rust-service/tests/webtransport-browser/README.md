# WebTransport browser validation

This harness runs the neutral `@fluidframework/sea-typescript` WebTransport factory against the native HTTP/3 server without disabling certificate validation.
The generated ECDSA P-256 certificate is valid for 13 days and the client pins its SHA-256 digest.
Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run the test from `rust-service/`.
The script builds the neutral package, generates a temporary certificate, starts the native server, runs both browser flows in headless Chromium, and shuts down the server.
It uses an isolated `CARGO_TARGET_DIR` and leaves the root manifest and lockfile unchanged.

```bash
tests/webtransport-browser/run-test.sh
```

The first flow uses the neutral WebTransport factory for plain and compressed sessions.
It verifies classified missing-document rejection, content references, live peer delivery, cancellation of a pending history read, snapshot notifications, latest and bounded lookup, and reopening.
An undecorated observer verifies that compression actually encodes stored bytes.
Both snapshot participation policies are supported; ordered unique session identities keep the expected SEA-selected publisher stable during the test.

The second neutral flow exercises backend-assigned document IDs, multiple ordered submissions on one event-author stream, gap-free load, live events, blob and directory round trips, and event-position snapshots.
It closes and reopens memberships through fresh factory calls, checks that closed sessions reject calls without retrying, and verifies snapshot-plus-suffix recovery.
It also cancels and renews snapshot participation, repeats cancellation of the old subscription without revoking the new registration, publishes while a notification read is pending, and checks rejection of a cancelled snapshot read.
Its connection count reports four successfully opened sessions, excluding the rejected missing-document attempt.
Shutdown checks prove that existing sessions still work during the drain, stop working after its deadline, and new sessions are rejected after acceptance stops.
The old generated API's same-client transport and snapshot-registration replacement tests remain separate migration work; this flow does not claim to exercise those removed API shapes.

The default flow opens snapshot coordination as `clientSelected`.
Run both flows with Sea-managed selection by setting `SEA_SNAPSHOT_POLICY=sea` on the script command.
The results report `participation` or `snapshotParticipation` as `clientSelected` or `seaSelected`.
Validation passed with durable-file storage and client-selected publication, and with `SEA_STORAGE_MODE=memory SEA_SNAPSHOT_POLICY=sea`, using Chromium 152 inside the Codespace.
Both flows run through `rust-service/test.sh`; they do not establish external-browser connectivity through Codespaces forwarding.

Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not infer unavailable network measurements.
