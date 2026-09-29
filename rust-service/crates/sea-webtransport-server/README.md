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
| `SEA_AUTHOR_WINDOW` | Integer from 1 through 4096 | 256 per author stream |
| `SEA_EXPERIMENTAL_LIVE_CACHE` | Exactly `true` or `false` | `true` |
| `SEA_EXPERIMENTAL_SESSION_FACTORY` | Exactly `true` or `false` | `false` |
| `SEA_EXPERIMENTAL_RESOURCE_POLICY` | Exactly `true` or `false` | `true` |

Invalid connection or author-window limits fail startup; `MAX_CONNECTIONS` and `AUTHOR_WINDOW` report the effective values.
Limits apply independently to QUIC and WebSocket and do not bound total memory or guarantee throughput.
An optional fifth argument is a shutdown-marker path used by process harnesses.
Enabled live caching, including the default, prints `EXPERIMENTAL_LIVE_CACHE=true`.
It configures document recovery for all backend modes and both transports without changing clients.
`SessionSetup::default()` also enables the cache.
To restore storage-backed delivery in the executable, set both `SEA_EXPERIMENTAL_LIVE_CACHE=false` and `SEA_EXPERIMENTAL_RESOURCE_POLICY=false`.
Embedded hosts can use `SessionSetup::default().with_live_cache(false)`.
Direct Rust/WASM sequencer construction remains storage-backed unless separately opted in.
Without the resource policy, this experiment has unbounded stalled-reader retention.
The default resource policy can shed lagging readers, but does not impose a hard total-memory bound.
Default-on remains a controlled-use rollout, not a production resource guarantee.
Transport timeouts do not establish a cache-retention bound for every reader path.
Invalid activation values fail startup rather than silently selecting a default.

`SEA_EXPERIMENTAL_SESSION_FACTORY=true` selects pass-through session factories and decoration for both listeners.
Also set `SEA_EXPERIMENTAL_RESOURCE_POLICY=false` to select this mode.
The process reports the effective choice as `EXPERIMENTAL_SESSION_FACTORY`.
`SessionSetup::default().decorate(PassThrough)` selects the same experimental path for embedded hosts.
This boundary adds no admission policy, automatic closure, delivery tracking, or resource guarantee.
It retains the existing connection-incarnation cleanup and error semantics.
Live-cache activation remains independent, so comparisons must explicitly enable caching on both direct and pass-through paths.

The executable defaults to `SEA_EXPERIMENTAL_RESOURCE_POLICY=true`, selecting the bounded policy-decorator path.
Set it to `false` to opt out.
Embedded hosts continue to select this policy explicitly with `SessionSetup::default().decorate(ReaderShedding)`; `SessionSetup::default()` alone remains undecorated.
Resource-policy and pass-through modes are mutually exclusive in the executable.
The process reports `EXPERIMENTAL_RESOURCE_POLICY` for activation provenance.
One policy per document permits at most 128 pending writes with 16 MiB of logical input charges and 128 live-reader reservations.
Write permits cover policy/FIFO waiting, then release before source invocation; source admission remains authoritative.
Live-reader permits cover pending loads and returned unbounded streams and release on observed termination or drop.
Finite reads and snapshot/control operations remain outside these limits.
Larger shared payload backing allocations, never-polled caller futures, and transport buffers are excluded.
The policy requires live caching; disabling the cache also requires explicitly disabling the policy.
Incompatible settings are rejected rather than silently dropping output-pressure management.
Durable-file writes wait, before source invocation, until both preparation and mutation budgets are at most 127 requests and 8 MiB each.
Memory and buffered-file backends do not wait for a disk-pressure signal.
Readiness is advisory; racing writers and larger operations may still receive source admission rejection.
Terminal observations refuse new operations before source invocation.
An ambiguous observation cause is retained for diagnostics but classified as unavailable for the refused operation, since that operation cannot have committed.
Failures after source invocation keep their source classification.
Output targets are 1,024 retained cache entries and 8 MiB canonical payload bytes.
Above either target, the policy refuses new sessions and live readers but does not pause existing authors.
One coalesced task per managed document sheds the oldest unread live subscription per turn until targets are met.
It rechecks targets before selecting a subscription and does not revoke historical or caught-up readers.
The task runs without a slow reader polling and ends on cache termination or policy drop; it holds no strong document/cache ownership.
Required entries remain retained until their owners dequeue, drop, or are revoked, so no finite overshoot is promised.
Reader-admission permits and already-dequeued payloads can survive cache revocation until their stream observes termination or is dropped.
An in-flight transport write is not interrupted by cache shedding; existing transport frame limits and operation timeouts still apply.
Policy-rejected application writes make the decorated author terminal across clones; caller/host-driven close and reconciliation remain required.
Close bypasses pressure waiting and does not cancel already-entered source work.
The shedding task is not a background close owner, and no total-memory guarantee is added.
Session setup without a decorator remains direct.

### Bounded author admission

Both listeners admit ordered application submissions while earlier submissions wait for storage.
This lets the existing sequencer queue and batch writes without changing persistence or acknowledging undurable data.
Policy decorators also release their admission-order turn after the source submission's first poll, rather than holding it until completion.
Their cancellation and failure guard remains active until completion; already-entered operations retain source-owned settlement.
Responses remain in request order and successful submission responses still wait for the storage commit.
Membership announcements and explicit close are barriers: all earlier responses finish before the control operation starts.
Clean receive EOF drains pending submissions before closing authority.
Malformed input, failed output, or a service error ends the stream and releases its pending futures; connection cleanup still owns settlement after transport cancellation.

`TransportConfig::max_pending_author_requests` bounds outstanding requests, including completed requests whose ordered responses have not been written.
Their encoded input-byte charges also cannot exceed `max_frame_bytes` (4 MiB by default).
The reader can additionally retain one bounded lookahead request and its framing buffer.
These are logical input bounds, not a bound on allocator overhead, decoded object overhead, transient encoding copies, downstream storage, or network buffers.
Backpressure stops further reads when capacity is exhausted; storage and session policies remain authoritative for their own admission.
The process setting `SEA_AUTHOR_WINDOW=1` restores completion-paced dispatch for comparison or rollback.
Shutdown `TRANSPORT_EVIDENCE` reports the maximum pending request count and encoded input-byte charge observed on any one author stream.

### Configured storage and session composition

Typed hosting uses one constructor: `DocumentHost::new(storage, sessions)`.
Wrap it in `SeaProtocolHost` to serve the Sea protocol, then pass that adapter, or its clones, to the WebTransport and WebSocket listeners.
The executable's environment flags and default policy are unchanged.

```rust
use sea_webtransport_server::{
    DocumentHost, PassThrough, ReaderShedding, SeaProtocolHost, SessionSetup, StorageSetup,
};

let memory = DocumentHost::new(StorageSetup::memory(), SessionSetup::default())?;

let durable = DocumentHost::new(
    StorageSetup::durable("./sea-data/documents".into()),
    SessionSetup::default()
        .decorate(ReaderShedding)
        .decorate(PassThrough),
)?;
let protocol = SeaProtocolHost::new(durable);
# Ok::<(), sea_webtransport_server::LiveCacheRequired>(())
```

`StorageSetup::memory()` creates an independent namespace and requires no path.
`StorageSetup::buffered(root)` and `StorageSetup::durable(root)` own their exact namespace paths; they do not append a directory name.
`StorageSetup::from_storage(storage)` accepts an already configured `SeaStorage`, without requiring `Clone`.
`StorageSetup::open_with(callback)` keeps custom synchronous initialization off the executor and retryable.
Custom storage setups can attach a durable-pressure accessor with `with_write_pressure`; it is not inferred from the storage type.

Decorator construction follows `.decorate(...)` call order, with each new decorator outside the previous factory.
The example uses `PassThroughFactory<PolicyFactory<LocalSessionFactory<_>, _>>`.
The identity configuration returns the local factory without an extra wrapper.
Any decorator requiring live caching causes `new` to return `LiveCacheRequired` if caching is disabled, before storage initialization.
The library permits decorator combinations; the executable keeps its mutually exclusive comparison flags.

#### Application-defined decorators and policies

Implement `SessionDecorator<Source, E>` to transform a source `SessionFactory` into another factory.
This is not restricted to resource policies: decorators can produce transparent wrappers or other compatible session implementations.
For policy injection, return `PolicyFactory::new(source, Arc::new(your_policy))`.
The `E` parameter preserves backend observation errors independently of errors introduced by earlier decorators.
The host calls each decorator once per recovered document opening, then shares the completed factory across that document's sessions.
Other documents receive separate factories; reopening a persistent document with a new host constructs a new chain.
Construction is serialized with document initialization, so keep decorators short and nonblocking.
`DocumentContext` supplies the document ID, optional storage pressure, and an optional live-cache observer.
Declare `requires_live_cache()` when the decorator needs that observer.
No membership is allocated before the composed factory opens a session.
To preserve readers instead of shedding them, implement `wait_write` using `output.wait_below(entry_target, byte_target)` and do not call `revoke_lagging`.
The [public-host integration test](tests/policy_injection.rs) contains a complete application decorator and bounded test policy, including durable-pressure waiting.
Its policy allows only small event submissions; a production policy must also decide admission for blob and directory writes.
Custom policies must provide their own bounded request/byte charges, reader permits, admission decisions, and observation-error classification.
An observation failure before source invocation must not classify the refused operation as ambiguous.
There is no hidden default shedding task: `ReaderShedding` runs only when explicitly included.

Reader dequeue or drop can release pressure and resume writers.
Close interrupts a pre-source policy wait, but does not cancel source-accepted work.
A permanently stalled reader can deliberately stall writers indefinitely.
Cache pressure ends at dequeue, not network delivery; durable pressure excludes sequencer handoff retention and OS buffering.
These signals and admission limits do not bound total process or transport memory.

#### Typed hosting and the protocol boundary

`DocumentHost` owns storage initialization, document recovery, session-factory composition, flush, and shutdown.
Its public `create_document`, `ensure_document`, and `open_session` operations use core document identities and typed sessions.
`DocumentHostError` retains storage, sequencer, and decorated-factory errors; direct callers can inspect their variants and classifications without decoding wire responses.
An in-process client or load generator does not need a protocol adapter:

```rust
use sea_core::{Event, EventSubmission, SeaAuthorSession};
use sea_webtransport_server::{DocumentHost, SessionSetup, StorageSetup};

# async fn run() -> Result<(), Box<dyn std::error::Error>> {
let documents = DocumentHost::new(StorageSetup::memory(), SessionSetup::default())?;
let id = documents.create_document().await?;
let author = documents.open_session(&id, None).await?.session;
author.submit(EventSubmission {
    reference: None,
    event: Event { payload: bytes::Bytes::from_static(b"local"), blob_tree: None },
}).await?;
author.close().await?;
documents.shutdown().await?;
# Ok(())
# }
```

Direct callers own session closure; dropping a session does not promise a committed departure.
They can keep a clone of `DocumentHost` while serving another clone through one shared `SeaProtocolHost`.
Host shutdown waits for admitted document workers even if their callers cancel, and pending operations cannot create or recover documents after shutdown completes.

The server's [protocol module](src/protocol/mod.rs) owns request dispatch, error conversion, version checks, authority tokens, connection/session binding, and protocol cleanup.
Concrete storage and session types are erased only at that adapter boundary.
Signal rooms belong to the protocol adapter; clone one adapter across listeners to share rooms as well as document policies.
Listeners retain socket/TLS configuration, stream and datagram I/O, and transport deadlines.
Shared wire definitions remain in `sea-webtransport::protocol` so native and WASM clients use the same format.
These protocol components could move to a separate crate if another transport needs independent reuse; no crate or wire-format change is required now.

#### Migration from the combined host

The previous `BuiltInSeaHost` is replaced by `DocumentHost::new(storage, sessions)` followed by `SeaProtocolHost::new(documents)` for network serving.
Document-host construction returns the configuration result; protocol adaptation is infallible and does not initialize storage.
The older `new(root, mode)`, `new_with_*`, and `with_storage` constructor family remains replaced by composable setup.
Select storage in the application rather than supplying a path that memory storage ignores.
To preserve existing on-disk namespaces, pass the previous `root.join("documents")` to the file recipe.
Replace pass-through and policy constructors with the corresponding decorators.
When migrating `with_storage`, explicitly use `.with_live_cache(false)` to preserve its former storage-backed delivery.
Applications using the earlier `DocumentPolicyBuilder` injection should instead implement `SessionDecorator` and return a `PolicyFactory`.

On startup the process prints `WEBTRANSPORT_URL`, `CERTIFICATE_SHA256`, `STORAGE_MODE`, and `PROTOCOL=sea`.
Clients connect to the printed `/sea` URL and pin the printed SHA-256 certificate digest.
It also prints heartbeat, inactivity, reconnect-grace, and legacy live-lag settings.

## Connection Lifecycle

Each admitted QUIC connection runs in an independently scheduled, server-owned task.
The connection limit includes pending handshakes, and shutdown cancels and joins remaining tasks before releasing their services.
Completed tasks are not cleaned up a second time when completion races with shutdown.
Ready response streams spend Tokio's cooperative task budget so cached readers cannot run indefinitely without yielding.
Author submissions enter the service in receive order and can overlap while awaiting storage, as described in [bounded author admission](#bounded-author-admission).
Scheduling connections independently does not change session APIs or storage commit semantics.

The listener requests a 2 MiB UDP socket receive buffer when the existing buffer is smaller.
The operating system can cap or adjust the effective size; a value below the request produces a startup diagnostic.
No host-wide socket settings are changed, and an already larger buffer is left unchanged.
QUIC flow-control windows and operation deadlines remain unchanged.
This reduces sensitivity to receive bursts but is not a guarantee against packet loss or overload timeouts.

| Stage or event | Behavior |
| --- | --- |
| QUIC admission | One `operation_timeout` covers the full handshake and path decision; pending admissions consume capacity and participate in shutdown. |
| Admission failure | Release capacity and connection-scoped service immediately, without reconnect grace or listener shutdown. |
| Established connection | Framed I/O has operation deadlines; idle streams use QUIC PING/authenticated-traffic liveness instead. |
| Connection loss | Revoke snapshot participation immediately; release author membership after reconnect grace. |
| Author request error | Terminate append authority on the first decode, validation, receive, or response-write failure. |
| Session close | Settle admitted work before the durable departure; unknown storage outcomes cannot claim completion. |
| Session replacement | Close the previous session and issue fresh authority on the same connection; previously admitted streams never acquire the replacement's authority. |
| Snapshot-stream loss | Revoke that registration, leaving other logical streams available. |

These framed-I/O deadlines are server-owned and independent of the [native client's request and partial-frame deadlines](../sea-webtransport/README.md#lifecycle-and-ownership).
See [snapshot participation](../sea-webtransport/README.md#snapshot-participation) for publication authority.

### Logical Stream Authority

An author, content, or snapshot stream validates its opening token once and retains the admitted session dispatcher for every later operation and cleanup.
Opening a replacement event stream does not retarget existing logical streams, even when the replacement selects a different document.
The previous session is closed, so subsequent operations on its bound streams are rejected or those streams end.
Already-admitted work remains subject to the original session's settlement rules.
Old author-stream EOF, close, decode failure, or response-write failure cannot close replacement membership.
Old snapshot registration cleanup cannot revoke replacement participation.
A rejected opening does not enter a session's operation or cleanup path.
Closing or failing the current bound author session revokes its opening token without adding reconnect grace for membership that is already closed.
This token cleanup removes the connection's current entry only if it still holds the same session dispatcher.
These rules apply to QUIC and the optional WebSocket listener through the shared stream dispatcher.

Custom `SeaConnectionService` implementations must implement `bind_session` to validate the token and return a dispatcher permanently scoped to the admitted session.
Returning the mutable connection router is not a valid binding.
`SessionDispatcher` provides the fixed-session implementation; it does not admit connection-level bindings itself.
See [Decision 0026](../../historical/decisions/0026-bind-stream-session-incarnations.md) for compatibility and regression evidence.

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
Both listeners share one `SeaProtocolHost`, so they can collaborate on the same documents and coordinate shutdown.
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
`StorageSetup::from_storage(storage)` accepts any `SeaStorage` implementation.
The generic document registry provides session opening, document existence checks, flush, and shutdown through one backend-independent interface.
Storage selection belongs to the application or executable; neither the host nor transport operations dispatch on backend kinds.
Creation allocates an opaque backend document ID and returns it with session authority; callers retain that ID for reopening.
No caller-name mapping is maintained.
The executable keeps file namespaces below its data directory's `documents` subdirectory; embedded callers supply exact namespace paths.

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
The binary shuts down the shared protocol adapter after both listeners finish; direct typed-host owners call `DocumentHost::shutdown` themselves.
An expired flush deadline reports cancellation, and a failed flush reports a storage error, not successful persistence.

Snapshot dispatch resolves wire roots and committed event positions through the session before constructing availability handles.
Session replacement preserves the [logical-stream authority binding](#logical-stream-authority) established at admission.
Committed membership `Joined` and `Left` positions are valid snapshot dependencies, just like application-kind event positions.
Snapshots are versioned by event position, not publication-operation IDs.
Each snapshot stream owns its own registration lease, so cleanup of an older stream cannot revoke its replacement.
An explicit snapshot `Close` acknowledges and ends that transport stream; lease drop, not session-wide revocation, releases its registration.

Invalid Sea message kinds, stream roles, or payloads terminate the owning native connection or WebSocket stream group.
No subsequent request on that connection is admitted after the failure is observed.
Earlier accepted submissions remain committed; terminal session cleanup preserves their recovery evidence.
Protocol failure does not stop the listener or unrelated connections, and ordinary stream cancellation remains stream-local.
Cancelling a monitored content read releases that stream even while its document is idle; cleanup does not wait for another event or connection loss.

## Validation

```bash
cargo test -p sea-webtransport-server --all-features
```

Host tests cover all storage modes, shared ownership, admission/authority failures, signals, and shutdown.
Use virtual time for byte-stream deadlines, not real QUIC handshakes.
The [browser harness](../../tests/webtransport-browser/README.md#physical-connection-release) tests physical release and mixed transports; [integration tests](../sea-integration-tests/README.md) cover decorator composition and repeated hops.
