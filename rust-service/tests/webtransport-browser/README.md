# WebTransport browser validation

This harness runs the neutral `@fluidframework/sea-typescript` WebTransport factory against the native HTTP/3 server without disabling certificate validation.
The generated ECDSA P-256 certificate is valid for 13 days and the client pins its SHA-256 digest.
Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run the test from `rust-service/`.
The script builds the neutral package and Fluid driver trace, generates a temporary certificate, starts the native server, runs the browser flows in headless Chromium, and shuts down the server.
It uses an isolated `CARGO_TARGET_DIR` and leaves the root manifest and lockfile unchanged.

```bash
tests/webtransport-browser/run-test.sh
```

The first flow runs the [Fluid driver trace](../minimal-fluid-driver/README.md) through neutral WebTransport sessions.
It checks summary reload, two-client push delivery, explicit pending recovery and resubmission, duplicate-free reconnect, and bounded history.

The package flow runs four fresh pages: split and combined loader presets, each with plain and compressed sessions.
It verifies classified missing-document rejection, content references, live peer delivery, cancellation of a pending history read, snapshot notifications, latest and bounded lookup, and reopening.
It also checks local memory sharing and isolation and asserts exactly the selected generated JavaScript/WASM requests: remote-only split loads no local bundle, and combined local/remote use shares one artifact pair.
Factory construction itself must not load a generated artifact.
Each preset/compression pair also runs a ServiceClient scenario in the existing SharedTree page.
It covers detached creation without a session, attachment, loading by the returned ID, bidirectional edits, reopening after closing both clients, and independent attached creation.
This is separate from the full explicit-recovery SharedTree lifecycle trace.
An undecorated observer verifies that compression actually encodes stored bytes.
Both snapshot participation policies are supported; ordered unique session identities keep the expected SEA-selected publisher stable during the test.

The final neutral flow exercises backend-assigned document IDs, multiple ordered submissions on one event-author stream, gap-free load, live events, blob and directory round trips, and event-position snapshots.
It closes and reopens memberships through fresh factory calls, checks that closed sessions reject calls without retrying, and verifies snapshot-plus-suffix recovery.
It also cancels and renews snapshot participation, repeats cancellation of the old subscription without revoking the new registration, publishes while a notification read is pending, and checks rejection of a cancelled snapshot read.
Its connection count reports four successfully opened sessions, excluding the rejected missing-document attempt.
Shutdown checks prove that existing sessions still work during the drain, stop working after its deadline, and new sessions are rejected after acceptance stops.
The old generated same-client transport API was retired; reopening uses a fresh factory call.
Snapshot-registration ownership also has focused sequencer and neutral Node regressions.

The default flow opens snapshot coordination as `clientSelected`.
Run the package and final flows with Sea-managed selection by setting `SEA_SNAPSHOT_POLICY=sea` on the script command.
The Fluid driver trace retains client-selected publication because Fluid owns that policy.
The results report `participation` or `snapshotParticipation` as `clientSelected` or `seaSelected`.
Validation passed with durable-file storage and client-selected publication, and with `SEA_STORAGE_MODE=memory SEA_SNAPSHOT_POLICY=sea`, using Chromium 152 inside the Codespace.
All three flows run through `rust-service/test.sh`; they do not establish external-browser connectivity through Codespaces forwarding.

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

On 2026-09-19, both cases passed in Chromium 152.
Temporarily removing only `BrowserTransport::disconnect`'s close call failed with `disconnect: physical connection did not release server capacity`.
Removing only Drop's close call instead failed with the corresponding `drop` message.
Each restoration passed; the production implementation is unchanged.

## Optional WebSocketStream Validation

Run the same collaboration and shutdown flow against the optional native `WebSocketStream` adapter:

```bash
SEA_WEBSOCKET_STREAM=1 tests/webtransport-browser/run-test.sh
```

The mode also checks healthy-primary preference, explicit WebTransport-only failure, initial timeout fallback, and missing-native-API rejection through the neutral `openRemote` factory.
Package-owned socket regressions cover disconnection during child creation.
The default command and minimal `webtransport` artifact remain WebTransport-only; `websocket` is a separate generated configuration, not an overwrite of default bindings.
The driver and compressed-session traces continue using QUIC in every mode; only the final collaboration/shutdown flow selects WebSocket.
Use `SEA_BROWSER_SKIP_BUILD=1` only after the package artifacts and driver trace have been built.

On 2026-09-18, Chromium 152 passed this flow locally with durable-file storage, including bounded shutdown and zero remaining connections.
On 2026-09-19 UTC, the Windows VS Code integrated browser (Chrome 148 / Electron 42) passed the real SEA collaboration flow through Codespaces public HTTPS/WSS forwarding with memory storage.
It covered document creation, three sessions, ordered/live events, blob/directory round trips, snapshots, and explicit reconnect with TLS validation enabled and no client tunnel or browser flags.
The disposable public ports were restored to private and both test listeners stopped.
The earlier synthetic probe below remains separate evidence for substantial two-way buffering and stall/recovery through the proxy; the SEA flow does not measure a global memory bound.

## Ordinary WebSocket Compatibility Validation

Run the same Chromium collaboration and shutdown flow with ordinary WebSocket, plus Node's built-in WebSocket against the temporary Rust listener:

```bash
SEA_ORDINARY_WEBSOCKET=1 SEA_NODE_WEBSOCKET=1 tests/webtransport-browser/run-test.sh
```

These settings enable the existing `websocket-stream` build feature automatically.
The Node setting additionally permits missing Origin only on the harness's loopback listener; do not use it for forwarded/public endpoints.
The ordinary browser mode checks `PreferAvailable` with unreachable QUIC and unavailable WebSocketStream through the neutral session factory.
The focused package test checks the false receive-backpressure capability and disconnection during child creation.
Selection probes run only on loopback-hosted pages: their deliberate loopback connection failures must not request access to an external visitor's local apps.
Externally hosted pages still run collaboration with the explicitly selected transport, without these selection probes.
Generated-binding regressions use a controlled event socket to test queue byte/message limits, upload throttling, cancellation, malformed records, FIN, handshake failure/timeouts, callback cleanup, and strict-mode refusal to fall back.
That test consumes the separate `websocket` artifact and runs in the package's normal Node test command.

Node 22.23.2's built-in WebSocket and local Chromium 152 passed these real SEA flows.
On 2026-09-19, the user reported a passing three-session ordinary-WebSocket collaboration run in Windows Firefox 156 through public Codespaces forwarding with memory storage.
The user denied a local-app permission prompt caused plausibly by the then-enabled loopback selection probe; collaboration still passed.
The probe is now restricted to loopback-hosted pages, but the revised external page has not been rerun in Firefox.
Private-window/login state was not confirmed; this is not a verified anonymous-browser result or an external shutdown test.
Ordinary WebSocket cannot provide receive backpressure: a slow consumer's bounded adapter queue fails on overflow instead of slowing the sender.
Neither the Node nor browser flow proves a total runtime/proxy memory bound.
No feature-mode rebuild is needed to return to the default flow because artifacts are isolated.

## Neutral-Factory Integration Validation

The Codespaces branch integration preserves the completed shared-session extraction in `SERVICE_CLIENT_PLAN.md`.
Socket mechanics now live under `sea-webtransport::transport`, while `sea-wasm` owns `openRemote` and the TypeScript package owns its separate generated artifact and browser/Node loaders.
Removed transport-owned session exports, injection hooks, and build scripts remain removed.
The archived investigation retains the pre-integration external Chromium and Firefox evidence; the merged neutral factory has not been rerun in those external browsers.

Local integration validation passed all 150 Rust workspace tests, strict native and WASM Clippy, strict rustdoc, formatting, build, documentation links, repository policy, and root `pnpm build:fast`.
The canonical `test.sh` passed default QUIC collaboration and shutdown, neutral plain/compressed sessions, and the Fluid driver trace.
Both optional Chromium 152 modes passed selection, four-session collaboration, and bounded shutdown; Node 22.23.2 passed real two-session collaboration through the package entrypoint.
The package's focused regression covers ordinary queue bounds, throttling, FIN, handshake failure, cancellation, and owner/child races; the browser checks cover native selection and transport composition.
Cargo dependency checks confirm minimal memory and WebTransport artifacts still exclude the socket capability and unrelated stack dependencies.

## Codespaces WebSocketStream Probe

The local `websocketstream-probe.mjs` server and `websocketstream-probe-client.mjs` page tested native browser backpressure through Codespaces forwarding without starting SEA.
They are preserved together under ignored `rust-service/target/websocket-probes/` in the isolated investigation worktree and are not committed source, part of `run-test.sh`, or part of the implemented adapter.
See the [investigation record](../../historical/CODESPACES_WEBTRANSPORT_PLAN.md#native-websocketstream-probe-2026-09-18) for setup, exposure limits, observed results, and cleanup.
The probe requires an existing `ws` installation supplied through `PROBE_WS_MODULE` and a browser with native `WebSocketStream`.
