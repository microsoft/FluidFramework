# @fluidframework/sea-typescript

This package provides non-Fluid-specific Sea sessions through package-owned WebAssembly (WASM) artifacts.
All APIs are internal.
Use the [Fluid driver](../sea-driver/README.md) for ServiceClient factories or the [example utilities](../../../examples/utils/example-utils/README.md) for application integration.

## Sessions

The current entrypoint supports independent memory services and real browser WebTransport sessions.
Both use the same Rust session bindings and can explicitly enable the existing compression decorator.
Sessions expose opaque event submission with optional content references, monitored history, immutable content, and snapshot coordination/publication/loading.
`getSnapshot()` selects the latest snapshot; an event bound selects the newest snapshot at or before that bound, or returns `undefined` when none exists.
Automatic reconnect, implicit retries, authentication, and arbitrary runtime decorator composition are not provided.

`announceMembership(metadata)` opts a session into ordered membership records.
History reports `eventType: "joined"`, `"application"`, or `"left"`; joined payloads contain immutable public metadata, and left payloads are empty.
Close, replacement, and service recovery append departures in the same order as application events.
Exact announcement retries return the original position; changing metadata is rejected.
Author calls are serialized in invocation order, including local identity conversion and generated-binding validation.
The first failed author call closes append authority and prevents queued submissions from committing.
Recover through an independent session: replay through the old session's departure, count accepted application events, reconcile them, then transform the unaccepted suffix for a fresh session.
Equal submissions are distinct events; there is no operation-ID lookup or automatic resubmission.
Metadata is public control data, like session identities: compression and encryption decorators do not transform or protect it.
Unannounced sessions retain application-only history.
`minimumReference` is the durable document-wide admission floor, not an active-member minimum.
It never decreases, including after new membership or recovery; an absent submission reference is below every concrete floor.
Advances commit atomically with their carrying event and arrive in the same live/replay order.
Remote consumers must rebuild client and server together for protocol version 11.
The sequencer allocates each session identity; opening options no longer accept one.
`session.sessionId` and delivered event `session` values encode the document-scoped nonzero `u64` as eight big-endian bytes, preserving its full precision.
Applications own author attribution.

## Live Signals

`session.openSignals({ id, metadata })` returns a separately closable `SeaSignals` connection.
Identities and metadata are byte arrays; metadata is public to other current members.
The first `next()` returns `{ kind: "members", members }`, followed by `joined`, `left`, and `message` events.
A message carries `sender`, `payload`, optional `target`, and the requested `delivery` mode.

```typescript
const signals = await session.openSignals({ id: connectionId, metadata: new Uint8Array() });
const initialMembership = await signals.next();
await signals.send(payload);
await signals.send(payload, { target: peerId, delivery: "bestEffort" });
await signals.close();
```

Broadcast includes self; targeting a missing current member succeeds without delivery.
Reliable is the default and applies only while the connection is live, not across failures or reconnect.
Best effort permits loss/reordering and uses WebTransport datagrams when supported and small enough.
Each hop independently falls back to reliable transport before datagram admission; there is no retry after admission.
Messages have no persistence, replay, event positions, or ordering relationship with document operations.
Archive compression does not transform signal bytes.

Only one `next()` may be pending per connection.
`close()` is idempotent, wakes pending reads, and leaves archive access open; closing the session also closes its signals.
The wrapper defers freeing generated objects until admitted calls settle.
Reliable queue overflow is a failure, not a silent drop; best-effort overflow may drop.
The remote host currently permits one signal registration per physical connection lifetime, so reopening signals requires a fresh remote session.
The built-in service has no production authentication or tenant quota policy.
See [the neutral relay contract](../../crates/sea-signals/README.md) and [transport behavior](../../crates/sea-webtransport/README.md).

## Local Example

```typescript
import { createMemoryService } from "@fluidframework/sea-typescript/internal/memory";

const service = await createMemoryService({ environment: "node" });
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const session = await service.open(undefined, {});
try {
    const position = await session.submit(undefined, encode("opaque payload"));
} finally {
    await session.close();
    service.close();
}
```

Each open returns a fresh allocated membership identity.
Pass a returned `session.document` to another `open` on the same service to share a document.
Separate `createMemoryService` calls have independent storage even when their WASM module is already initialized.
Memory services do not persist across reloads or share storage across independent browser windows.

## Bundles and Environments

Import `createMemoryService` from `@fluidframework/sea-typescript/internal/memory` or `openWebTransport` from `@fluidframework/sea-typescript/internal/webtransport` to load only the corresponding capability factory.
The root `internal` entrypoint exposes both factories.
Importing a factory does not initialize WASM; its first call loads only the selected artifact.
The remote factory module has no runtime dependency on the memory factory or its generated bundles.

`createMemoryService` defaults to the browser target and the minimal `memory` artifact.
Select `environment: "node"` for Node.js.
Select `configuration: "memory-compression"` to make compression available, then set `compression: true` in session options to enable it.
An unsupported capability fails before opening the session; there is no silent fallback.

`openWebTransport` takes a URL, development certificate SHA-256 digest, optional document identity, and session options.
Its `webtransport` and `webtransport-compression` artifacts require a browser with WebTransport support and a reachable QUIC endpoint.
Compression configuration must match between collaborating clients and when reopening a document.
The native service need not decode compressed application payloads.
No external-browser connectivity through Codespaces forwarding is established by the package's internal Chromium test.

Artifacts are `memory`, `webtransport`, their `-compression` variants, `combined`, `combined-compression`, and the independent `websocket` configuration.
Each uses isolated outputs/targets and explicit Cargo features, producing Node and web JavaScript targets.
Node outputs do not supply a Node WebTransport implementation.
Consumers must not import generated paths directly.

## Loader Presets

Select packaging once at the application composition point:

```typescript
import { createSeaFactories } from "@fluidframework/sea-typescript/internal/presets";

const factories = createSeaFactories({ preset: "split", compressionSupport: true });
const localService = await factories.createMemoryService();
```

Changing only `preset` to `"combined"` keeps the same service and session APIs.
`factories.openWebTransport({ url, certificateHash }, document, sessionOptions)` always uses WebTransport without fallback.
| Preset | Artifact loading | Storage |
| --- | --- | --- |
| `split` | Memory and remote artifacts load independently on first use. | Each memory-service call creates an independent namespace. |
| `combined` | Both capabilities share one initialized module. | Same isolation; share a service explicitly to share documents. |

Initialization, including failure, is cached per artifact/target; factory construction does not fetch WASM.

`compressionSupport` defaults to false and selects compiled capabilities only.
Session options must still set `compression: true` to encode payloads; unsupported compression is rejected without changing the selected stack.
`environment: "node"` supports memory services under either preset and rejects WebTransport with `Unavailable`.
The separate optional socket factory retains its explicit transport policies and is not implicitly included in either preset.

### Artifact Measurements

From the repository root, build artifacts and measure their existing bytes:

```bash
pnpm --dir rust-service/packages/sea-typescript run build
node rust-service/packages/sea-typescript/scripts/build-wasm.mjs --measure
```

Measurement is read-only and emits features, SHA-256 digest, raw bytes, gzip level 9 bytes, and Brotli quality 11 bytes per artifact/target.

<details>
<summary>Dated browser artifact sizes (2026-09-19)</summary>

Totals sum separately compressed JavaScript and WASM files, excluding wrappers, declarations, metadata, and network overhead.
These are size comparisons, not measured wire traffic or startup performance.

| Configuration | JavaScript Bytes | WASM Bytes | Total Bytes | Gzip Bytes | Brotli Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| memory | 32,573 | 569,682 | 602,255 | 145,467 | 113,469 |
| webtransport | 40,073 | 534,690 | 574,763 | 138,732 | 109,646 |
| combined | 41,661 | 854,515 | 896,176 | 216,597 | 165,085 |
| memory-compression | 32,573 | 672,948 | 705,521 | 174,731 | 136,986 |
| webtransport-compression | 40,073 | 642,124 | 682,197 | 168,798 | 132,739 |
| combined-compression | 41,661 | 1,004,050 | 1,045,711 | 253,711 | 192,442 |
| websocket (independent) | 57,355 | 838,144 | 895,499 | 192,227 | 143,940 |

Measured on 2026-09-19 in Debian 13, Linux x64, Node 22.23.2, Rust 1.98.1 (`48a229cea`), and wasm-bindgen 0.2.128, after merge baseline `b4e06f85151` with the preset implementation.
Builds use `wasm32-unknown-unknown`, release mode, `--no-default-features`, explicit features from the build script, and `RUSTFLAGS='--cfg=web_sys_unstable_apis -C target-feature=+simd128'` without additional overrides.
</details>

## Optional WebSocket Sessions

`openRemote` from `@fluidframework/sea-typescript/internal/websocket` loads only the separate `websocket` artifact and returns the same neutral session contract.
Set `mode` explicitly to `WebTransport`, `WebSocketStream`, `PreferWebTransport`, `WebSocket`, or `PreferAvailable`.
The preference modes attempt WebTransport then native WebSocketStream; only `PreferAvailable` may continue to ordinary WebSocket.
Selection happens before SEA session operations, with no replay or mid-session switching.
`openWebTransport` remains strict.

Supply `url` and `certificateHash` for modes that attempt QUIC and `websocketUrl` for modes that permit sockets.
Trust both endpoints independently: a QUIC pin does not authenticate a TLS-terminating WebSocket proxy.
`timeoutMilliseconds` defaults to 5000 per connection attempt, so three-choice selection can take up to three intervals.
Set `environment: "node"` for Node's built-in ordinary WebSocket; the default environment is the browser.
This artifact does not include compression; requesting it is rejected before a session opens.

Ordinary WebSocket enables Node and non-streaming browser compatibility but cannot apply receive backpressure.
Each socket's adapter queue fails at 4 MiB or 256 messages instead of dropping bytes; upload admission uses `bufferedAmount` throttling.
These are not runtime, kernel, or proxy memory bounds, and slow consumers can fail rather than slow the sender.
Applications must accept the weakest guarantees allowed by their selected policy.
See the [transport contract](../../crates/sea-webtransport/README.md#optional-websocketstream-fallback) and [listener setup](../../crates/sea-webtransport-server/README.md#optional-websocket-listener), including the separate default-off originless-loopback exception for direct Node tests.

## Ownership and Failures

Initialization is cached per artifact and JavaScript target; it does not allocate shared document storage.
The TypeScript wrapper copies content identities into plain values and keeps generated objects inside their originating WASM module.
Call `cancel()` on streams and `close()` on sessions and memory services when finished.
Closing a session leaves other sessions intact; releasing a memory service prevents new opens through that service object but does not forcibly close existing sessions.
Close is idempotent and prevents new operations immediately.
Admitted operations retain the generated allocation until they settle, so close never frees a WASM object still borrowed by an asynchronous call.
An open admitted before memory-service close may still return a usable session.
Session close can race an admitted write; its outcome must be observed or resolved, not inferred from close.
Stream reads are sequential; a second concurrent read is rejected.

Session-operation and backend factory-open failures retain their Rust SEA category in an error's `kind` field, described by `SeaError` and `SeaErrorKind`.
Invalid binding inputs and unsupported capabilities are `Rejected`; wrapper calls after close are `Closed`, a wrapper-only category rather than a core SEA classification.
Artifact import and WASM initialization failures can still be ordinary platform errors without a SEA category.
No error or cancelled wait establishes that an ambiguous write did not commit.

## Validation

From the repository root:

```bash
pnpm --dir rust-service/packages/sea-typescript run build
pnpm --dir rust-service/packages/sea-typescript test
```

To build prerequisites and test in one step, run `pnpm exec fluid-build rust-service/packages/sea-typescript --task test:mocha:esm`.

| Coverage | Location |
| --- | --- |
| Sessions, content, snapshots, compression, ownership, errors, presets, and lazy imports | [Package tests](src/test) |
| Public consumer types and closed unions | [Type assertions](src/test/types/seaApi.ts) |
| Real Node WebSocket | Package test enabled by `SEA_NODE_TRANSPORT_URL`; skipped without a listener. |
| Browser transports, both presets, compression, and exact artifact loading | [Browser harness](../../tests/webtransport-browser/README.md), included in `test.sh` |
| SharedTree lifecycle and comparison benchmarks | [Integration harness](../../tests/sea-integration-tests/README.md) |

For a manual browser run, start the harness's server and run from `rust-service/`:

```bash
node tests/sea-integration-tests/browser/run-headless.mjs packages/sea-typescript <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __seaPackageResult browser.html
```

The caller owns native-service/certificate/data cleanup; the runner owns its temporary Chromium profile and HTTP server.
`build:wasm` tracks explicit inputs/outputs, including external Cargo sources; unchanged builds skip generation, while missing outputs or changed features invalidate it.