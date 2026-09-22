# Sea WebTransport

This crate owns the bounded, versioned Sea wire protocol, one platform-independent client implementation, and native and browser transport primitives.
Native and browser builds share framing, ordered exchanges, logical-stream state machines, recovery, and lifecycle behavior.
They differ only where their environments open connections and read or write bytes.

## Architecture

One document-bound connection supports five bidirectional logical stream roles:

| Role | Purpose |
| --- | --- |
| Event | Open the session; return document ID/authority, selected snapshot, catch-up, progress, and live events. |
| Author | Ordered submissions, receipts, and close under session authority. |
| Snapshot | Coalesced notifications and policy-bound publication. |
| Content | Ordered history/content/snapshot lookup; unary calls reuse a stream, each monitored read owns its stream. |
| Signal | Independent live membership and messages for an existing document, without archive mutations. |

Each frame contains one explicit `MessageKind` byte, a four-byte big-endian length counting the kind and payload bytes, then a postcard-serialized kind-specific payload.
The five-byte envelope has no correlation ID.
No-blob submissions and deliveries have distinct kinds and omit the blob option tag; both decode into the same event model as blob-bearing messages.
The decoder accepts fragmentation and coalescing and enforces `max_frame_bytes` before payload decoding.
An unknown kind fails as soon as its first byte arrives; invalid kinds, roles, or bodies terminate the owning connection without admitting later requests.
Earlier accepted submissions remain committed and recoverable through the session's terminal departure.
Each reusable stream completes one request before starting the next; bounded content responses end with `ResponseComplete`.
Snapshot coordination and signal notifications are identified by kind and do not complete requests.
Cancelling a response wait makes the affected exchange stream unusable, preventing a stale reply from completing a later request.
Monitored progress responses are out-of-band observations and may cut ahead of buffered event responses without reordering those events.

Protocol version 11 replaces caller-selected session bytes with sequencer-allocated nonzero `u64` identities in opening responses and delivered events.
Postcard encodes these integers as varints; no alias table or identity reuse is involved.
The protocol retains signals and the durable monotonic reference floor, with no author identities or correlation IDs.
Sea identifies session incarnations and orders their events; applications decide who those sessions represent.
Equal submissions are new events; recovery uses ordered session history through the terminal departure.
Rebuild client and server together; earlier protocol versions are not compatible.
Documents use backend-assigned opaque IDs.
Creation supplies no document ID; the open response returns the ID to retain for subsequent sessions.
Submissions return committed event positions; durability is a backend property.

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

`SessionClient<Transport>` implements the session facets for native and browser transports.
`SessionClient::open` accepts a configured transport and session parameters; `NativeSeaClient::connect` additionally configures SHA-256 certificate pinning.
Private-provenance handles confirm availability within the resolving client; they are never wire authority.
Event-position resolution currently scans retained history, and tree resolution fetches the corresponding immutable content.
Disconnect and reconnect are explicit; operations are never retried automatically.
An author-stream error or cancelled receipt makes that stream terminal before another request can be sent.
The next request or explicit close cancels the failed transport stream; recovery uses a fresh session and the old session's durable departure barrier.
Active frame reads and writes have deadlines, while an idle healthy stream does not inherit the operation deadline.
Connection loss releases author membership and snapshot participation according to server liveness policy.
Protocol or transport failure closes the owning connection without terminating the server endpoint.

Snapshot subscriptions own their registrations; replacement/cancellation/drop cannot release a newer registration.
Native/browser-local tasks serialize requests independently of coordination notifications, allowing publication during a pending notification read.
Cancelling a notification wakes its waiter.
Browser reads retain their JavaScript promise across cancelled Rust waiters, since dropping a Rust future does not cancel a JavaScript read.
Explicit browser disconnect closes the underlying WebTransport session.
JavaScript-facing session values and their resource ownership belong to `sea-wasm` and `sea-typescript`, not this transport crate.

The native listener, server dispatch, archive routing, connection liveness, measurements, and shutdown policy belong to the separate [`sea-webtransport-server`](../sea-webtransport-server/) crate.

## Targets And Generated Bindings

The [WASM crate](../sea-wasm/README.md) owns shared session exports and feature-gated stack construction.
The [TypeScript package](../../packages/sea-typescript/README.md) owns generated artifacts, lazy loaders, and neutral application APIs.
This crate is a Rust library on both targets.
Its separate test-only `browser_lifecycle` cdylib supplies ownership controls for [physical-release browser regressions](../../tests/webtransport-browser/README.md#physical-connection-release).
Generate the package-owned web and Node artifacts from the repository root with:

```bash
pnpm --dir rust-service/packages/sea-typescript run build
```

Consumers import package entrypoints, not crate output paths.
The minimal remote configuration excludes local storage, sequencer, compression, and encryption dependencies.
All generated files are build artifacts and must not be edited.

## Optional `WebSocketStream` Fallback

The off-by-default `websocket-stream` Cargo feature adds socket primitives and explicit initial transport selection under `transport::browser_socket`.
`sea-wasm` and `sea-typescript` expose these through neutral sessions.
Strict modes require native `WebSocketStream`; explicit compatibility modes permit ordinary `WebSocket` in Node and browsers, at the cost of receive backpressure.
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
  { session: sessionIdentity },
);
```

| Mode | Initial attempts, in order | Receive backpressure |
| --- | --- | --- |
| `WebTransport` | WebTransport only | Required |
| `WebSocketStream` | Native `WebSocketStream` only | Required |
| `PreferWebTransport` | WebTransport, then native `WebSocketStream` | Required |
| `WebSocket` | Ordinary WebSocket only | Unavailable |
| `PreferAvailable` | WebTransport, native `WebSocketStream`, ordinary WebSocket | Not guaranteed |

Each attempt gets its own timeout and is closed before fallback, so total selection can take two or three timeout intervals.
Fallback permits any initial establishment error; it completes before Sea operations and never switches mid-session or replays requests.
Low-level `connect` is streaming-only; `connectOrdinary` opts into compatibility behavior, reported by `supportsReceiveBackpressure`.
Applications must accept the weakest guarantees their policy permits.
A streaming implementation must actually propagate reader demand to the network; API presence alone is not runtime validation.
Callers opting into automatic fallback must trust both endpoints: the WebTransport pin does not authenticate the independently configured WebSocket TLS proxy.
Only `wss:` URLs are accepted outside loopback; URLs cannot contain credentials, queries, or fragments.

A control socket owns a group, and each logical stream uses its own WebSocket and the group's fixed API choice.
Native `WebSocketStream` preserves independent receive backpressure; ordinary WebSocket cannot pause message delivery when the application stops reading.
Binary DATA records carry at most 64 KiB; FIN is directional EOF, not a WebSocket close.
Close before FIN is cancellation or failure, and closing the owner cancels every child.
Pending reads survive Rust waiter cancellation, and concurrent sends or receives on the same direction are rejected.

The ordinary adapter caps each socket's receive queue at 4 MiB and 256 messages and rejects individual messages larger than a 64 KiB DATA record plus its tag.
Overflow closes and fails the stream; it never silently drops bytes or reports clean EOF.
Slow consumers can therefore fail instead of slowing the sender, and must explicitly reconnect through the application's existing recovery policy.
Uploads throttle admission using `bufferedAmount`, allowing at most two maximum-sized records in the reported native send buffer; this does not restore receive backpressure.
Queue limits are per socket, not per connection, and do not bound already delivered messages, runtime/kernel buffering, or proxy memory.
Node's built-in client sends no Origin: direct local tests require the server's separate, default-off loopback allowance described below.

An awaited write is not a remote application acknowledgment; intermediary buffering is implementation-dependent.
WebSocket has no QUIC datagrams or built-in production authentication.
See the [server setup](../sea-webtransport-server/README.md#optional-websocket-listener) and [browser validation](../../tests/webtransport-browser/README.md#optional-websocketstream-validation).

## Validation

Run from `rust-service/`:

```bash
cargo test -p sea-webtransport --all-targets --all-features
cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-webtransport --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../tests/webtransport-browser/README.md).
Tests cover framing, queue policy, native reliable/datagram signals, generated bindings, oversized fallback, mixed transports, and physical release.
