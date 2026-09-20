# Sea WebTransport

This crate owns the bounded, versioned Sea wire protocol, one platform-independent client implementation, and native and browser transport primitives.
Native and browser builds share framing, correlation, logical-stream state machines, recovery, and lifecycle behavior.
They differ only where their environments open connections and read or write bytes.

## Architecture

One document-bound client connection supports five logical stream roles:

- The **event stream** opens the logical session, returns the backend document ID and opaque session authority, and carries a selected snapshot followed by catch-up, monitored progress, and live events.
- The **author stream** uses that authority for ordered submissions, receipts, ambiguity resolution, and close.
- The **snapshot stream** uses that authority for latest-value snapshot notifications and policy-bound publication.
- A **content stream** uses that authority for correlated history, blob, directory, and snapshot lookup operations.
  Unary operations reuse one stream, while each monitored history read owns a content-role stream for its finite or live lifetime.
- An optional **signal stream** opens document-scoped live membership independently of event/author authority.
  It carries reliable messages and membership observations without appending archive events.

Each frame is length-delimited and contains an explicit `MessageKind`, stream-scoped correlation ID, and postcard-serialized kind-specific payload.
The decoder accepts fragmentation and coalescing, rejects unknown kinds and wrong-stream messages, and enforces `max_frame_bytes` before payload decoding.
Correlation ID zero is reserved for unsolicited event, snapshot, and signal notifications.
Monitored progress responses are out-of-band observations and may cut ahead of buffered event responses without reordering those events.

An **archive** is durable or process-local retained state.
A **logical session** is one connection-bound author identity within an archive.
A **logical stream** is one persistent bidirectional byte stream with a single role.
A **client** owns one transport connection and the shared state for its logical streams.
The **protocol** is the versioned frame and message contract, not the server implementation or application adapter.

Protocol version 9 removes operation IDs and resolution messages while retaining signals and the durable monotonic reference floor.
Equal submissions are new events; recovery uses ordered session history through the terminal departure.
Rebuild client and server together; earlier protocol versions are not compatible.
Documents use backend-assigned opaque IDs.
Creation supplies no document ID; the open response returns the ID to retain for subsequent sessions.
There is no caller-name mapping or compatibility reader for earlier protocol versions.
Submission and resolution return committed event positions, not per-operation durability receipts.
Durability remains a backend property.

Snapshots contain a root and committed event position, which is also their document-scoped version.
Publication carries the expected parent position and optional nomination fence; the receiver resolves tree and event availability before publishing.
An exact retry at the same position and root succeeds, but a different root at that position fails.
Snapshot lookup selects the newest snapshot at or before its inclusive bound; latest lookup needs no publisher subscription.
There is no empty initial snapshot: applications with initial state must first commit an event.
Loads select the latest or bounded snapshot and then replay the retained suffix without promising an atomic captured head.

## Signal Delivery

`SessionClient::signal_service` returns a document-bound `SeaSignalService`; `open_signals` is its convenience entrypoint.
The low-level client can open a signal stream for an existing document without opening an author stream.
The first observed event is the reliable membership snapshot, even if QUIC datagrams arrive earlier.
Payloads and public metadata are opaque; archive compression and encryption decorators do not transform them.

Reliable is the default delivery mode and always uses the signal byte stream.
Best effort first tries one complete framed datagram when the transport supports it and the encoded frame fits its current maximum size.
Unsupported or oversized messages fall back to the reliable stream before datagram admission.
After admission there is no acknowledgement, retry, retransmission by Sea, or switch to reliable delivery.
Each hop chooses independently: a QUIC sender can reach a WebSocket recipient and a WebSocket sender can reach a QUIC recipient.
Reliable membership/control frames are never sent as datagrams; malformed or non-message inbound datagrams are not routed by the server.
Best effort remains permitted to drop even when one or both hops use reliable fallback.

The client has 64 pending submission slots and 256 received-event slots.
Reliable or membership overflow ends delivery observably; only best-effort messages may be dropped silently.
Exactly one application receive may be pending; cancellation does not consume an event.
Close wakes pending receives and cancels the stream without closing archive access.
The current remote host admits one signal registration per physical connection lifetime.
Re-registration uses a fresh transport connection, so delayed datagrams cannot be attributed to a replacement identity.
Session reconnect in the Fluid adapter already creates that fresh connection; no traffic is replayed.

Owning-module tests cover codec round trips and queue policy.
`signals_cross_native_connections_without_archive_events` exercises real QUIC reliable and datagram delivery.
The Chromium harness covers generated bindings, oversized fallback, and mixed QUIC/WebSocket recipients.

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
An author-stream error or cancelled receipt makes that stream terminal before another request can be sent.
The next request or explicit close cancels the failed transport stream; recovery uses a fresh session and the old session's durable departure barrier.
Active frame reads and writes have deadlines, while an idle healthy stream does not inherit the operation deadline.
Connection loss releases author membership and snapshot participation according to server liveness policy.
Protocol or transport failure closes the owning connection without terminating the server endpoint.

The returned snapshot subscription owns its registration.
Replacing, cancelling, or dropping it releases only that registration, not a newer one.
Native tasks and browser-local tasks serialize snapshot requests while independently delivering coalescible coordination updates.
Publication can proceed while a notification read is pending; cancelling the notification wakes its waiter.
Browser reads retain their JavaScript promise across cancelled Rust waiters, since dropping a Rust future does not cancel a JavaScript read.
Explicit browser disconnect closes the underlying WebTransport session.
JavaScript-facing session values and their resource ownership belong to `sea-wasm` and `sea-typescript`, not this transport crate.

The native listener, server dispatch, archive routing, connection liveness, measurements, and shutdown policy belong to the separate [`sea-webtransport-server`](../sea-webtransport-server/) crate.

## Targets And Generated Bindings

The [WASM crate](../sea-wasm/README.md) owns shared session exports and feature-gated stack construction.
The [TypeScript package](../../packages/sea-typescript/README.md) owns generated artifacts, lazy loaders, and neutral application APIs.
This crate is an ordinary Rust library on both native and WASM targets; it no longer exports generated session classes, JavaScript transport injection, or local test-service bindings.
Its test-only `browser_lifecycle` cdylib example provides concrete ownership controls for the [physical-release browser regressions](../../tests/webtransport-browser/README.md#physical-connection-release).
The harness generates this example separately; it is not part of the package's shipped bindings.
Generate the package-owned web and Node artifacts from the repository root with:

```bash
pnpm --dir rust-service/packages/sea-typescript run build
```

Consumers import package entrypoints, not crate output paths.
The minimal remote configuration excludes local storage, sequencer, compression, and encryption dependencies.
All generated files are build artifacts and must not be edited.

## Optional `WebSocketStream` Fallback

The off-by-default `websocket-stream` Cargo feature adds socket primitives and explicit initial transport selection under `transport::browser_socket`.
The owning `sea-wasm` factory and `sea-typescript` package expose these through neutral sessions; legacy generated session classes remain removed.
The default WebSocket adapter requires native `WebSocketStream`; strict modes never substitute ordinary `WebSocket` or a JavaScript stream wrapper.
Explicit compatibility modes also support the built-in `WebSocket` in Node and browsers without streaming transports, including Firefox, without adding an npm dependency.
This provides a development path when QUIC or the streaming API is unavailable, at the cost of receive backpressure.
Generate the package-owned socket artifact from `rust-service/` with:

```bash
node packages/sea-typescript/scripts/build-wasm.mjs websocket
```

Select a transport policy through the package entrypoint:

```javascript
import { openRemote } from "@fluidframework/sea-typescript/internal/websocket";

const session = await openRemote(
  {
    mode: "PreferWebTransport",
    url: webTransportUrl,
    certificateHash: certificateSha256,
    websocketUrl: "wss://your-service.example/sea/websocket",
    timeoutMilliseconds: 5000,
  },
  document,
  { author, session: sessionIdentity },
);
```

`WebTransport` mode never falls back; `WebSocketStream` mode skips QUIC; `PreferWebTransport` explicitly permits fallback on any initial WebTransport establishment error or timeout.
`WebSocket` selects ordinary WebSocket directly; `PreferAvailable` attempts WebTransport, native `WebSocketStream`, then ordinary WebSocket.
Only these last two modes permit the reduced receive guarantees.
`SeaWebSocketTransport.connect` remains streaming-only; `connectOrdinary` directly selects the compatibility adapter.
Each attempt has the supplied timeout, so selection can take up to twice that interval for `PreferWebTransport` or three times for `PreferAvailable`.
The failed attempt is closed before fallback; selection completes before any Sea operation.
There is no mid-session switching, request replay, or automatic reconnect.
The low-level `SeaWebSocketTransport.supportsReceiveBackpressure` getter distinguishes streaming (`true`) from ordinary (`false`) sockets for transport tests.
Applications receive a neutral session and must accept the weakest guarantees their chosen policy permits.
A streaming implementation must actually propagate reader demand to the network; API presence alone is not runtime validation.
Callers opting into automatic fallback must trust both endpoints: the WebTransport pin does not authenticate the independently configured WebSocket TLS proxy.
Only `wss:` URLs are accepted outside loopback; URLs cannot contain credentials, queries, or fragments.

A control socket owns a group, and each logical stream uses its own WebSocket and the group's fixed API choice.
Native `WebSocketStream` preserves independent receive backpressure; ordinary WebSocket cannot pause message delivery when the application stops reading.
Binary DATA records carry at most 64 KiB; FIN is directional EOF, not a WebSocket close.
Close before FIN is cancellation or failure, and closing the owner cancels every child.
Pending reads survive Rust waiter cancellation, and concurrent sends or receives on the same direction are rejected.
The SEA codec, correlation, session, storage, and application layers are unchanged.

The ordinary adapter caps each socket's receive queue at 4 MiB and 256 messages and rejects individual messages larger than a 64 KiB DATA record plus its tag.
Overflow closes and fails the stream; it never silently drops bytes or reports clean EOF.
Slow consumers can therefore fail instead of slowing the sender, and must explicitly reconnect through the application's existing recovery policy.
Uploads throttle admission using `bufferedAmount`, allowing at most two maximum-sized records in the reported native send buffer; this does not restore receive backpressure.
Queue limits are per socket, not per connection, and do not bound already delivered messages, runtime/kernel buffering, or proxy memory.
Node's built-in client sends no Origin: direct local tests require the server's separate, default-off loopback allowance described below.

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
