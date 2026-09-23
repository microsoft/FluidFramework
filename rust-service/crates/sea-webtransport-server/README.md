# Sea WebTransport Server

This native-only crate owns the deployable Sea WebTransport server library and executable.
It owns listener and TLS setup, connection and stream dispatch, runtime storage selection, archive routing, measurements, and graceful shutdown.
It depends on `sea-webtransport` only for shared wire values and framing; the client crate does not depend on this server crate.

Run from `rust-service/`:

```bash
cargo run -p sea-webtransport-server -- \
	127.0.0.1:4433 cert.pem key.pem ./sea-data
```

| Setting | Values | Default |
| --- | --- | --- |
| `SEA_STORAGE_MODE` | `memory`, `buffered-file`, `durable-file` | `durable-file` |
| `SEA_MAX_CONNECTIONS` | Integer from 1 through 4096 | 16 per listener |
| `SEA_EXPERIMENTAL_LIVE_CACHE` | Exactly `true` or `false` | `true` |

Invalid connection limits fail startup; `MAX_CONNECTIONS` reports the effective value.
Limits apply independently to QUIC and WebSocket and do not bound total memory or guarantee throughput.
An optional fifth argument is a shutdown-marker path used by process harnesses.
Enabled live caching, including the default, prints `EXPERIMENTAL_LIVE_CACHE=true`.
It configures document recovery for all backend modes and both transports without changing clients.
`BuiltInSeaHost::new` also enables the cache.
Set `SEA_EXPERIMENTAL_LIVE_CACHE=false`, or use `BuiltInSeaHost::new_with_live_cache(..., false)`, to restore storage-backed delivery.
Generic `BuiltInSeaHost::with_storage` and direct Rust/WASM sequencer construction remain storage-backed unless separately opted in.
This experiment has unbounded stalled-reader retention and is not a production resource policy.
Default-on is a controlled-use rollout accepting that risk, not merely a fixed memory overhead.
Transport timeouts do not establish a cache-retention bound for every reader path.
Invalid activation values fail startup rather than silently selecting a default.

On startup the process prints `WEBTRANSPORT_URL`, `CERTIFICATE_SHA256`, `STORAGE_MODE`, and `PROTOCOL=sea`.
Clients connect to the printed `/sea` URL and pin the printed SHA-256 certificate digest.
It also prints heartbeat, inactivity, reconnect-grace, and legacy live-lag settings.

## Connection Lifecycle

| Stage or event | Behavior |
| --- | --- |
| QUIC admission | One `operation_timeout` covers the full handshake and path decision; pending admissions consume capacity and participate in shutdown. |
| Admission failure | Release capacity and connection-scoped service immediately, without reconnect grace or listener shutdown. |
| Established connection | Framed I/O has operation deadlines; idle streams use QUIC PING/authenticated-traffic liveness instead. |
| Connection loss | Revoke snapshot participation immediately; release author membership after reconnect grace. |
| Author request error | Terminate append authority on the first decode, validation, receive, or response-write failure. |
| Session close | Settle admitted work before the durable departure; unknown storage outcomes cannot claim completion. |
| Snapshot-stream loss | Revoke that registration, leaving other logical streams available. |

See [snapshot participation](../sea-webtransport/README.md#snapshot-participation) for publication authority.

## Ephemeral Signals

The built-in host shares a [`SignalRoom`](../sea-signals/README.md) per existing document across both listeners.
Admission checks document existence independently of append authority; signals do not mutate the archive.
Signal membership ends on signal-stream loss or connection loss, without the ordered author's reconnect grace.
The host stamps the sender from the admitted registration; message payloads cannot select another sender.
Current defaults are 1024 members per room, 256 queued events per recipient, 64 KiB payload/metadata limits, and 256-byte identities.
These bounds are not a tenant quota or rate limiter.

**No user authentication:** callers supply document and live identity.
A production host must authorize both before invoking the relay; existence and identity uniqueness are not authorization.
Membership metadata and payloads are visible to the relay and recipients; they are not protected by archive decorators.
One signal registration is admitted per connection lifetime, including after explicit signal close.
Use a fresh connection for another registration; this prevents old datagrams from crossing registration lifetimes.

## Optional WebSocket Listener

Compile with the off-by-default `websocket-stream` feature and explicitly configure a separate TCP listener:

```bash
SEA_WEBSOCKET_BIND=127.0.0.1:8081 \
SEA_WEBSOCKET_ORIGINS=http://localhost:8080 \
cargo run -p sea-webtransport-server --features websocket-stream -- \
	127.0.0.1:4433 cert.pem key.pem ./sea-data
```

Merely compiling the feature does not open another listener.
`SEA_WEBSOCKET_ORIGINS` is a comma-separated, exact backend-visible Origin allowlist; empty entries and `*` are rejected.
Missing Origin is rejected by default.
For direct local Node tests only, set `SEA_WEBSOCKET_ORIGINLESS_LOOPBACK=1` (or call `with_originless_loopback_clients` before serving).
This requires a loopback-bound listener and loopback peer, and permits only an absent header; any present Origin, including `null`, must still match the allowlist.
The setting accepts only `0` or `1` and defaults to disabled.
A local forwarding proxy also appears as a loopback peer, so do not enable this exception on a forwarded/public endpoint; it is not authentication.
The binary keeps its existing QUIC arguments and prints `WEBSOCKET_URL` when the optional listener is enabled.
Both listeners share one `BuiltInSeaHost`, so they can collaborate on the same documents and coordinate shutdown.
Custom hosts can bind `WebSocketServer` directly without starting QUIC or loading a QUIC certificate.

The listener speaks plain HTTP WebSocket upgrades at `/sea/websocket`, using subprotocol `sea-stream-v1`.
Control and child sockets enable `TCP_NODELAY` before upgrade.
Native `WebSocketStream` and explicitly selected ordinary WebSocket clients use this same protocol and grouping.
Ordinary clients enable Node and broader browser compatibility but cannot propagate application receive demand to the network.
Their adapter queue fails on overflow; bounded server buffers do not provide a total memory bound for those clients or intermediaries.
Put it behind a trusted TLS/authenticating proxy for remote `wss:` use.
Codespaces forwarding provides TLS, but can rewrite Origin to `http://localhost:<listener-port>`; configure the observed backend value, not a wildcard.
An Origin check and the random child-association token are not user authentication.
Public exposure permits untrusted callers; use disposable data for development tests and restore private port visibility afterward.
Do not expose retained or sensitive data through an unauthenticated public port.

A control socket creates one dispatcher and receives an opaque, random 256-bit association token.
Each logical stream opens its own socket at `/sea/websocket/<token>`; avoid logging these token-bearing paths.
Loss of the control connection removes the token, cancels children, and calls dispatcher cleanup exactly once.
Control ping/pong uses the configured heartbeat and inactivity policy, independently of data-stream backpressure.
Group and stream counts use `TransportConfig` limits, with a bounded total of active socket tasks and timed upgrades.
Limits and measurement handles are per listener, not combined across QUIC and WebSocket listeners.
The existing drain policy stops acceptance, lets admitted work proceed until its deadline, then cancels groups and releases membership without reconnect grace.

Server messages are capped at 64 KiB of DATA plus one tag byte, with a one-record receive queue and bounded write buffering per stream.
FIN closes only the sender's direction; premature socket close, invalid tags, text on data sockets, and oversized messages fail the stream.

Focused listener and stream tests:

```bash
cargo test -p sea-webtransport-server --features websocket-stream websocket
```

## Document Ownership

The host uses `SeaStorage` factories and `LocalSequencer`.
`BuiltInSeaHost::with_storage(storage)` accepts any `SeaStorage` implementation.
The generic document registry provides session opening, document existence checks, flush, and shutdown through one backend-independent interface.
Only the built-in constructor selects memory, buffered-file, or durable-file storage; transport operations do not dispatch on backend kinds.
Creation allocates an opaque backend document ID and returns it with session authority; callers retain that ID for reopening.
No caller-name mapping is maintained.
File modes keep their namespace below `root/documents`.

A host serializes lazy factory initialization and first document recovery.
Factory initialization, document creation, and recovery run on Tokio blocking workers so slow filesystem synchronization does not stall network polling or operation deadlines.
Workers retain their initialization locks and cache successful results even if the initiating request is cancelled.
Cancellation or a client timeout does not roll back creation or stop filesystem work; a created document can remain retained without its ID reaching the caller.
Pending workers retain the registry until they finish, and runtime shutdown may wait for them.
Concurrent sessions for one document share one recovered runtime and its exclusive view; failed initialization is not cached and can be retried explicitly.
The registry retains successful runtimes for the host lifetime, with no idle eviction.
Dropping the host and its connections releases those views; stopping the listener alone does not evict a separately retained host.
Live replay uses backend monitored streams; the legacy liveness lag setting does not bound this path.
The registry still serializes first opens across documents.
File backends isolate subsequent mutations and historical reads on bounded workers; this does not promise bounded storage latency or constant throughput on virtualized devices.
Listener drains flush their accepted storage prefix within the drain deadline without stopping a host shared by another listener.
The binary shuts down the shared host after both listeners finish; direct host owners call `BuiltInSeaHost::shutdown` themselves.
An expired flush deadline reports cancellation, and a failed flush reports a storage error, not successful persistence.

Snapshot dispatch resolves wire roots and committed event positions through the session before constructing availability handles.
Snapshots are versioned by event position, not publication-operation IDs.
Each snapshot stream owns its own registration lease, so cleanup of an older stream cannot revoke its replacement.
An explicit snapshot `Close` acknowledges and ends that transport stream; lease drop, not session-wide revocation, releases its registration.

Invalid Sea message kinds, stream roles, or payloads terminate the owning native connection or WebSocket stream group.
No subsequent request on that connection is admitted after the failure is observed.
Earlier accepted submissions remain committed; terminal session cleanup preserves their recovery evidence.
Protocol failure does not stop the listener or unrelated connections, and ordinary stream cancellation remains stream-local.

## Validation

```bash
cargo test -p sea-webtransport-server --all-features
```

Host tests cover all storage modes, shared ownership, admission/authority failures, signals, and shutdown.
Use virtual time for byte-stream deadlines, not real QUIC handshakes.
The [browser harness](../../tests/webtransport-browser/README.md#physical-connection-release) tests physical release and mixed transports; [integration tests](../sea-integration-tests/README.md) cover decorator composition and repeated hops.
