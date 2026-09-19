# Sea WebTransport

This crate owns the bounded, versioned Sea wire protocol, one platform-independent client implementation, native client transport, and generated browser/injected bindings.
Native and browser builds share framing, correlation, logical-stream state machines, recovery, and lifecycle behavior.
They differ only where their environments open connections and read or write bytes.

## Architecture

One document-bound client connection uses four persistent logical streams:

- The **event stream** opens the logical session, returns the backend document ID and opaque session authority, and carries a selected snapshot followed by catch-up, monitored progress, and live events.
- The **author stream** uses that authority for ordered submissions, receipts, ambiguity resolution, and close.
- The **snapshot stream** uses that authority for latest-value snapshot notifications and policy-bound publication.
- A **content stream** uses that authority for correlated history, blob, directory, and snapshot lookup operations.
  Unary operations reuse one stream, while each monitored history read owns a content-role stream for its finite or live lifetime.

Each frame is length-delimited and contains an explicit `MessageKind`, stream-scoped correlation ID, and postcard-serialized kind-specific payload.
The decoder accepts fragmentation and coalescing, rejects unknown kinds and wrong-stream messages, and enforces `max_frame_bytes` before payload decoding.
Correlation ID zero is reserved for unsolicited event and snapshot notifications.
Monitored progress responses are out-of-band observations and may cut ahead of buffered event responses without reordering those events.

An **archive** is durable or process-local retained state.
A **logical session** is one connection-bound author identity within an archive.
A **logical stream** is one persistent bidirectional byte stream with a single role.
A **client** owns one transport connection and the shared state for its logical streams.
The **protocol** is the versioned frame and message contract, not the server implementation or application adapter.

Protocol version 5 uses backend-assigned opaque document IDs.
Creation supplies no document ID; the open response returns the ID to retain for subsequent sessions.
There is no caller-name mapping or compatibility reader for earlier protocol versions.
Submission and resolution return committed event positions, not per-operation durability receipts.
Durability remains a backend property.

Snapshots contain a root and committed event position, which is also their document-scoped version.
Publication carries the expected parent position and optional nomination fence; the receiver resolves tree and event availability before publishing.
An exact retry at the same position and root succeeds, but a different root at that position fails.
`getSnapshot(position)` selects the newest snapshot at or before its inclusive bound; `latestSnapshot()` needs no publisher subscription.
There is no empty initial snapshot: applications with initial state must first commit an event.
Loads select the latest or bounded snapshot and then replay the retained suffix without promising an atomic captured head.

## Snapshot Participation

Snapshot coordination opens with one immutable policy:

- `ReadOnly` receives accepted-snapshot updates and cannot publish.
- `SeaSelected` publishes only while holding Sea's current nomination fence.
- `ClientSelected` publishes without a Sea fence because the application owns election and scheduling.

Any active client-selected publisher suppresses Sea selection.
When the last client-selected stream leaves, Sea deterministically nominates one active Sea-selected stream if available.
Nomination selects authority; it never requests or schedules snapshot generation.
See [Decision 0012](../../historical/decisions/0012-fluid-snapshot-election-integration.md).

## Lifecycle And Ownership

`SessionClient<Transport>` implements the same typed session facets over native or browser transport primitives.
`NativeSeaClient` retains its certificate-pinned `connect` API as the native specialization.
`SessionClient::open` accepts an already configured transport and explicit session-open parameters, allowing the existing Rust compression decorator to wrap browser sessions.
Snapshot pump cancellation uses the same ownership model with native tasks or browser-local tasks.

`NativeSeaClient` pins a SHA-256 certificate hash and implements the replacement `sea_core::session` facets.
Its private-provenance handles confirm remote availability and are scoped to the resolving client; they are never sent as wire authority.
Event-position resolution currently scans retained history, and tree resolution fetches the corresponding immutable content.
Disconnect and reconnect are explicit; operations are never retried automatically.
Active frame reads and writes have deadlines, while an idle healthy stream does not inherit the operation deadline.
Connection loss releases author membership and snapshot participation according to server liveness policy.
Protocol or transport failure closes the owning connection without terminating the server endpoint.

The returned snapshot subscription owns its registration.
Replacing, cancelling, or dropping it releases only that registration, not a newer one.
Native tasks and browser-local tasks serialize snapshot requests while independently delivering coalescible coordination updates.
Publication can proceed while a notification read is pending; cancelling the notification wakes its waiter.
Browser reads retain their JavaScript promise across cancelled Rust waiters, since dropping a Rust future does not cancel a JavaScript read.
Explicit browser disconnect closes the underlying WebTransport session.
Optional generated tree inputs are non-consuming typed JavaScript references, so a submitted tree identity remains usable for publication.

The native listener, server dispatch, archive routing, connection liveness, measurements, and shutdown policy belong to the separate [`sea-webtransport-server`](../sea-webtransport-server/) crate.

## Targets And Generated Bindings

The default `bindings` feature retains the existing generated API during migration.
The new [WASM crate](../sea-wasm/README.md) disables default features when depending on this crate so it can own generated session exports without linking the legacy binding surface.
Migration to the new [TypeScript package](../../packages/sea-typescript/README.md) is in progress; the legacy build commands below still serve existing consumers.

The `src/wasm/` library module exports browser and injected-transport bindings from the same shared client used by native Rust.
It is library code rather than a Cargo example because downstream applications consume generated bindings; there is no standalone scenario to run.

Generate the canonical web and Node packages with:

```bash
node crates/sea-webtransport/scripts/build-wasm.mjs
```

The command runs from `rust-service/` and writes production outputs to `crates/sea-webtransport/pkg/web/` and `crates/sea-webtransport/pkg/node/`.
The minimal Fluid driver, Node behavior tests, and real Chromium harness consume those locations directly.
The same command emits feature-gated process-local test bindings under `crates/sea-webtransport/test-support/pkg/`; production outputs exclude `sea-memory`, `sea-sequencer`, native endpoints, and server lifecycle code.
All generated files are build artifacts and must not be edited.

## Optional `WebSocketStream` Fallback

The off-by-default `websocket-stream` Cargo feature adds `SeaWebSocketTransport`, `SeaBrowserTransportMode`, and `connectSeaBrowserTransport` to browser bindings.
It requires the browser's native `WebSocketStream` API; it never substitutes the traditional `WebSocket` API or a JavaScript stream wrapper.
Generate these optional bindings from `rust-service/` with:

```bash
SEA_WEBSOCKET_STREAM=1 node crates/sea-webtransport/scripts/build-wasm.mjs
```

Pass the selected raw transport to the existing shared client:

```javascript
const transport = await connectSeaBrowserTransport(
  SeaBrowserTransportMode.PreferWebTransport,
  webTransportUrl,
  certificateSha256,
  "wss://your-service.example/sea/websocket",
  1024 * 1024,
  5000,
);
const client = new SeaInjectedClient(transport, 1024 * 1024);
```

`WebTransport` mode never falls back; `WebSocketStream` mode skips QUIC; `PreferWebTransport` explicitly permits fallback on any initial WebTransport establishment error or timeout.
Each attempt has the supplied timeout, so automatic selection can take up to twice that interval.
The failed attempt is closed before fallback; selection completes before any Sea operation.
There is no mid-session switching, request replay, or automatic reconnect.
The returned class identifies the selected transport.
Callers opting into automatic fallback must trust both endpoints: the WebTransport pin does not authenticate the independently configured WebSocket TLS proxy.
Only `wss:` URLs are accepted outside loopback; URLs cannot contain credentials, queries, or fragments.

A control socket owns a group, and each logical stream uses its own WebSocket with independent native backpressure.
Binary DATA records carry at most 64 KiB; FIN is directional EOF, not a WebSocket close.
Close before FIN is cancellation or failure, and closing the owner cancels every child.
Pending reads survive Rust waiter cancellation, and concurrent sends or receives on the same direction are rejected.
The SEA codec, correlation, session, storage, and application layers are unchanged.

Message bounds limit adapter queues, not browser, kernel, proxy, or total process memory.
Native browser receive queues and intermediaries have implementation-dependent buffering; do not treat an awaited write as a remote application acknowledgement.
This does not provide QUIC datagrams, identical network behavior, or production authentication.
See the [server setup](../sea-webtransport-server/README.md#optional-websocket-listener) and [browser validation](../../tests/webtransport-browser/README.md#optional-websocketstream-validation).

## Validation

Run from `rust-service/`:

```bash
cargo test -p sea-webtransport --all-targets --all-features
cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-webtransport --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../tests/webtransport-browser/README.md).
