# @fluidframework/sea-typescript

This package provides non-Fluid-specific SEA sessions through package-owned WASM artifacts.
Its APIs are internal; shared bindings and packaging presets are implemented, while higher-level ServiceClient and example integration remain in the [integration plan](../../SERVICE_CLIENT_PLAN.md).
Fluid summary tests, direct SharedTree package tests, and the SharedTree browser lifecycle trace now consume this package through the reusable `sea-driver` projection.
Browser benchmarks and the canonical Node, Fluid driver, and transport/shutdown harnesses also use the neutral factories.

## Supported Foundation

The current entrypoint supports independent memory services and real browser WebTransport sessions.
Both use the same Rust session bindings and can explicitly enable the existing compression decorator.
Sessions expose opaque event submission with optional content references, submission resolution, monitored history, immutable blobs and directories, and snapshot coordination, publication, lookup, and loading.
`getSnapshot()` selects the latest snapshot; an event bound selects the newest snapshot at or before that bound, or returns `undefined` when none exists.
Automatic reconnect, implicit retries, authentication, and arbitrary runtime decorator composition are not provided.

```typescript
import { createMemoryService } from "@fluidframework/sea-typescript/internal/memory";

const service = await createMemoryService({ environment: "node" });
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const session = await service.open(undefined, {
    author: encode("example-author"),
    session: encode("fresh-session"),
});
try {
    await session.submit(encode("operation-1"), undefined, encode("opaque payload"));
} finally {
    await session.close();
    service.close();
}
```

Use a fresh membership identity for each open and stable operation identities when resolving ambiguous submissions.
Pass a returned `session.document` to another `open` on the same service to share a document.
Separate `createMemoryService` calls have independent storage even when their WASM module is already initialized.
Memory services do not persist across reloads or share storage across independent browser windows.

## Bundles and Environments

Import `createMemoryService` from `@fluidframework/sea-typescript/internal/memory` or `openWebTransport` from `@fluidframework/sea-typescript/internal/webtransport` to load only the corresponding capability factory.
These entrypoints share initialization and ownership handling with the existing root `internal` entrypoint.
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

The build script generates `memory`, `webtransport`, `websocket`, `combined`, `combined-compression`, `memory-compression`, and `webtransport-compression` artifacts in isolated output and Cargo target directories.
Each configuration builds with explicit features and no default features, producing both Node and web JavaScript targets.
The Node outputs for remote configurations do not provide a Node WebTransport implementation.
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
The split preset loads memory and remote artifacts independently on first use; the combined preset shares one initialized module between both capabilities.
Each `createMemoryService()` still creates independent storage, even across factories using the same cached module.
Callers share a service explicitly and close services, sessions, and streams using the same ownership rules under either preset.
Initialization, including failure, is cached per artifact and target; construction of the factory object does not initialize or fetch WASM.

`compressionSupport` defaults to false and selects compiled capabilities only.
Session options must still set `compression: true` to encode payloads; unsupported compression is rejected without changing the selected stack.
`environment: "node"` supports memory services under either preset and rejects WebTransport with `Unavailable`.
The separate optional socket factory retains its explicit transport policies and is not implicitly included in either preset.
Existing capability entrypoints remain available for applications that only need one capability.
Non-SEA example selections are unchanged; the example composition point and its build-time preset override remain stage 5 work.

### Artifact Measurements

From the repository root, build artifacts and measure their existing bytes:

```bash
pnpm --dir rust-service/packages/sea-typescript run build
node rust-service/packages/sea-typescript/scripts/build-wasm.mjs --measure
```

Measurement is read-only and emits JSON for each configuration and JavaScript target with features, SHA-256 digest, raw bytes, gzip level 9 bytes, and Brotli quality 11 bytes.
The following browser totals sum separately compressed JavaScript and WASM files, not one concatenated file.
They exclude declarations, module metadata, TypeScript wrapper code, HTTP headers, and transport overhead; the harness serves uncompressed files, so these are compression comparisons, not measured wire traffic.

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
Plain combined costs 77,865 more gzip bytes than remote-only split, but saves 67,602 gzip bytes when both split capabilities would be loaded.
Compressed combined similarly saves 89,818 gzip bytes over both compressed split capabilities.
These measurements support the packaging choice; they do not establish a universal best preset or startup-performance claim.

Chromium 152 inside the Codespace runs each preset/compression case in a fresh page.
The remote-only split case requests exactly its selected WebTransport JavaScript and WASM, with no memory, combined, socket, or unrelated decorator bundle.
Local use afterward adds only the selected memory pair; combined use shares its one pair across both services.
The same scenarios verify remote collaboration, snapshot reopening, local sharing and isolation, and real compressed bytes.

## Optional WebSocket Sessions

`openRemote` from `@fluidframework/sea-typescript/internal/websocket` loads only the separate `websocket` artifact and returns the same neutral session contract.
Set `mode` explicitly to `WebTransport`, `WebSocketStream`, `PreferWebTransport`, `WebSocket`, or `PreferAvailable`.
The preference modes attempt WebTransport then native WebSocketStream; only `PreferAvailable` may continue to ordinary WebSocket.
Selection happens before SEA session operations, with no replay or mid-session switching.
The existing `openWebTransport` API and its minimal artifact remain strict and unchanged.

Supply `url` and `certificateHash` for modes that attempt QUIC and `websocketUrl` for modes that permit sockets.
Trust both endpoints independently: a QUIC pin does not authenticate a TLS-terminating WebSocket proxy.
`timeoutMilliseconds` defaults to 5000 per connection attempt, so three-choice selection can take up to three intervals.
Set `environment: "node"` for Node's built-in ordinary WebSocket; the default environment is the browser.
No npm WebSocket dependency is added.
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

The Node tests use capability entrypoints and cover sharing, isolation, compression, immutable content, events, snapshot reload, cancellation, and capability rejection.
Migrated session regressions also cover live peer delivery, recursive content, idempotent publication, explicit snapshot fences, operation conflicts, superseded authors, reused memberships, and explicit reopening.
The canonical Node harness executes twenty-one local package tests, including preset equivalence, capability rejection, initialization caching, snapshot-registration ownership, and bounded socket lifecycle behavior.
An additional real Node socket test runs when the harness supplies `SEA_NODE_TRANSPORT_URL`.
An emitted-module import-graph test checks lazy artifact imports and excludes unrelated capabilities and dependencies from each factory entrypoint.
`browser.html` runs identical plain/compressed local and remote scenarios through both presets, with fresh-page artifact loading assertions in the canonical script.
The canonical WebTransport script runs this flow alongside the neutral Fluid driver trace and transport/shutdown checks, making neutral browser coverage part of `test.sh`.
Both client-selected/durable-file and SEA-selected/memory configurations passed live delivery, pending-read cancellation, classified errors, content references, snapshot notifications and lookup, and reopening in Chromium 152 inside the Codespace.
With a running development server and certificate from the [browser harness](../../tests/webtransport-browser/README.md), run from `rust-service/`:

```bash
node tests/minimal-fluid-driver/browser/run-headless.mjs packages/sea-typescript <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __seaPackageResult browser.html
```

The existing runner is test orchestration only; this package has no dependency on the Fluid harness, driver, runtime, or SharedTree.
The caller owns the native service and its certificate/data cleanup; the runner owns its temporary Chromium profile and HTTP server.
An initial Chromium 152 run inside the Codespace passed both configurations with 2,800-byte blob and event payloads, snapshot publication, and reopening.
Local and remote tests also read compressed blobs through an undecorated observer to verify that the factory actually encodes stored bytes.
This does not establish inventory-app acceptance or external-browser behavior of the new presets.

The initial foundation passed workspace Rust formatting, strict Clippy and rustdoc, build and tests, documentation links, and `rust-service/test.sh` with the existing generated-client and Chromium scenarios.
The package passes formatting, TypeScript compilation, API report generation, export validation, Node tests, repository policy checks, and dependency-layer validation.
Cargo normal/build dependency checks confirmed that the memory artifact excludes transport, compression, and encryption; the minimal remote artifact excludes memory, sequencer, compression, and encryption; and the compressed remote artifact still excludes memory, sequencer, and encryption.
An npm packaging dry run included JavaScript, declarations, WASM, and module metadata for all ten generated targets.

The required repository-root `pnpm build:fast` passed after the historical benchmark formatting was corrected separately in commit `023ac56ea45`.

Continuation tests cover content-reference reuse, absent and bounded snapshot lookup, factory categories, service close during open, and session close during an operation and subsequent calls.
The reusable `SeaSessionDriverClient` in `sea-driver` consumes an injected session factory; neutral APIs contain no Fluid initialization or sequence-number projection.
Migrated summary and direct SharedTree collaboration tests pass through package entrypoints.
Eight consecutive real Chromium SharedTree lifecycle runs passed attachment, collaboration, session closure at submission admission, explicit ambiguity resolution and resubmission, and reload.
The earlier intermittent `session is closed` failure exposed two driver defects: membership replacement interrupted archive reads, and independent read-first containers shared a SEA author and superseded each other's memberships.
The driver now drains admitted reads before replacement, defers later reads, and retains a unique author per read-first document service.
Deterministic Node regressions cover both cases.
The root build, canonical Rust checks, `test.sh`, and focused Node tests do not substitute for this separately invoked SharedTree trace.

Chromium 152 inside the Codespace passed eight small benchmark cases: dummy and SharedTree data structures, Fluid and direct integration, and local memory and remote durable-file WebTransport.
The benchmark runner requires exactly the selected configuration's generated JavaScript and WASM requests, rejecting unrelated generated-artifact loads.
These are behavioral and loading checks, not comparative performance measurements.

The neutral package's `build:wasm` task tracks explicit inputs and outputs through its task-level `files` configuration.
The external Cargo inputs use explicit globs without package-relative gitignore filtering; generated Cargo targets and legacy binding outputs are excluded.
An unchanged second build skips generation.
Validation restored all ten targets after removing the generated output tree, regenerated a missing memory WASM file, and rebuilt after temporarily enabling compression in the memory configuration.
Restoring the minimal configuration rebuilt again and restored unsupported-compression rejection through the package entrypoint.

Legacy transport-owned generated exports, JavaScript injection hooks, named-create flags, test-support bundles, and their build task have been removed.
The obsolete injection-hook and named-create tests were retired with those APIs; general document allocation, registration ownership, and lifecycle behavior remain covered through their current owners.
The migrated Fluid driver trace additionally checks bounded history and explicit pre-commit recovery through neutral remote sessions.