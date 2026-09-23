# Sea Browser Transport Validation

This harness runs the neutral `@fluidframework/sea-typescript` WebTransport factory against the native HTTP/3 server without disabling certificate validation.
The generated ECDSA P-256 certificate is valid for 13 days and the client pins its SHA-256 digest.
Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.
The runner uses the integration harness's [Chromium lifecycle support](../sea-integration-tests/browser/chromium.mjs) for browser startup, bounded CDP requests, and process/profile cleanup.
The transport harness retains its own page serving, transport assertions, and server-shutdown probes.

Run the test from `rust-service/`.
The script builds the neutral package, Fluid driver trace, and native server once and generates a temporary certificate.
It runs the shared browser flows once, then runs the final session and shutdown scenario over WebTransport, WebSocketStream, and ordinary WebSocket.
Each transport uses a fresh server process, service-data directory, and shutdown marker.
The first socket mode also runs the real Node WebSocket test once against its loopback listener.
It uses an isolated `CARGO_TARGET_DIR` and leaves the root manifest and lockfile unchanged.

```bash
tests/webtransport-browser/run-test.sh
```

For a focused run, set `SEA_BROWSER_TRANSPORT` to `webtransport`, `websocketstream`, or `websocket`.
The default is `all`; an explicit value takes precedence over the legacy flags shown below.
Invalid values fail before building or starting a server.
Each final scenario prints `TRANSPORT_MODE`, browser results, shutdown results, and server cleanup evidence.

## Coverage

| Flow | Assertions |
| --- | --- |
| [Fluid driver trace](../sea-integration-tests/README.md) | Summary reload, two-client delivery, explicit pending recovery/resubmission, duplicate-free reconnect, bounded history. |
| Neutral package: split/combined, plain/compressed | Missing-document errors, content, live delivery, read cancellation, snapshot lookup/notifications/reopen, local sharing/isolation. |
| Artifact loading | Factory construction loads nothing; split loads only selected capabilities; combined shares one artifact pair. An undecorated observer verifies encoded bytes. |
| ServiceClient: each preset/compression pair | Detached creation, attachment, load by ID, bidirectional edits, reopen, independent creation. |
| Final transport flow | Allocated IDs, ordered submissions, gap-free loads, content round trips, snapshots, close/reopen, closed-call rejection without retry. |
| Snapshot ownership | Old cancellation cannot revoke replacement; publication works with a pending notification; cancelled reads reject. |
| Shutdown | Existing sessions work during drain and fail after its deadline; new sessions fail after acceptance stops. |

The final flow reports four successful sessions, excluding missing-document rejection.
Unique ordered session identities stabilize Sea-selected publisher expectations.

The default flow opens snapshot coordination as `clientSelected`.
Run the package and final flows with Sea-managed selection by setting `SEA_SNAPSHOT_POLICY=sea` on the script command.
The Fluid driver trace retains client-selected publication because Fluid owns that policy.
The results report `participation` or `snapshotParticipation` as `clientSelected` or `seaSelected`.
The shared flows and all three transport modes run through `rust-service/test.sh`; they do not establish external-browser connectivity through Codespaces forwarding.

Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not infer unavailable network measurements.

## Physical Connection Release

`run-test.sh` also builds the test-only `browser_lifecycle` WASM example and explicitly runs the normally ignored `browser_disconnect_and_drop_release_capacity` Rust test.
The Rust fixture owns a certificate-pinned one-slot listener and launches the existing Chromium runner with `SEA_BROWSER_LIFECYCLE_WASM` pointing to the temporary generated bindings.
No shipped session export or production configuration option is added.

Two independent cases exercise the concrete `BrowserTransport`:

- Explicit disconnect retains the Rust owner until a waiting replacement connection is admitted.
- Final-owner drop uses the generated `free()` method without calling disconnect first.

Both cases first check that the replacement cannot enter while the owner holds the slot, then require admission within three seconds of release.
Native JavaScript transport objects remain strongly referenced so collection cannot substitute for either close call.
The server uses a 120-second inactivity timeout and is not shut down until the browser assertions finish.
The Rust test separately checks four connection cleanups, peak concurrency one, and no remaining active connections before shutdown.
The fixture creates no logical sessions, so membership closure cannot mask physical-release failure.

## WebSocketStream Validation

Run only the final WebSocketStream collaboration and shutdown mode, together with the shared flows and live Node test:

```bash
SEA_BROWSER_TRANSPORT=websocketstream tests/webtransport-browser/run-test.sh
```

The legacy `SEA_WEBSOCKET_STREAM=1` flag selects the same mode when `SEA_BROWSER_TRANSPORT` is unset.
The mode also checks healthy-primary preference, explicit WebTransport-only failure, initial timeout fallback, and missing-native-API rejection through the neutral `openRemote` factory.
Package-owned socket regressions cover disconnection during child creation.
The minimal `webtransport` artifact remains WebTransport-only; `websocket` is a separate generated configuration, not an overwrite of default bindings.
The driver and compressed-session traces continue using QUIC in every mode; only the final collaboration/shutdown flow selects WebSocket.
Use `SEA_BROWSER_SKIP_BUILD=1` only after the package artifacts and driver trace have been built.

## Ordinary WebSocket Compatibility Validation

Run only the final ordinary WebSocket collaboration and shutdown mode, together with the shared flows and Node's built-in WebSocket against the temporary Rust listener:

```bash
SEA_BROWSER_TRANSPORT=websocket tests/webtransport-browser/run-test.sh
```

The legacy `SEA_ORDINARY_WEBSOCKET=1` flag selects this mode when `SEA_BROWSER_TRANSPORT` is unset.
The legacy `SEA_NODE_WEBSOCKET=1` flag alone selects WebSocketStream mode; both socket modes now run the live Node test without a separate opt-in.
All-mode and socket-only runs enable the existing `websocket-stream` build feature automatically.
Socket-mode servers additionally permit missing Origin only on the harness's loopback listener; do not use this setting for forwarded/public endpoints.
The ordinary browser mode checks `PreferAvailable` with unreachable QUIC and unavailable WebSocketStream through the neutral session factory.
The focused package test checks the false receive-backpressure capability and disconnection during child creation.
Selection probes run only on loopback-hosted pages: their deliberate loopback connection failures must not request access to an external visitor's local apps.
Externally hosted pages still run collaboration with the explicitly selected transport, without these selection probes.
Generated-binding regressions use a controlled event socket to test queue byte/message limits, upload throttling, cancellation, malformed records, FIN, handshake failure/timeouts, callback cleanup, and strict-mode refusal to fall back.
That test consumes the separate `websocket` artifact and runs in the package's normal Mocha test command.

Ordinary WebSocket cannot provide receive backpressure: a slow consumer's bounded adapter queue fails on overflow instead of slowing the sender.
Neither the Node nor browser flow proves a total runtime/proxy memory bound.

## Codespaces WebSocketStream Probe

The [investigation record](../../historical/CODESPACES_WEBTRANSPORT_PLAN.md#native-websocketstream-probe-2026-09-18) retains synthetic backpressure probes and pre-integration external Chromium/Firefox evidence.
Probe sources were ignored experimental files, not part of this harness.
The merged neutral factory has not been revalidated in those external browsers; local runs do not prove anonymous access, external shutdown, or a global memory bound.
