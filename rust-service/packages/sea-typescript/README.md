# @fluidframework/sea-typescript

This package provides non-Fluid-specific SEA sessions through package-owned WASM artifacts.
Its APIs are internal and under active development in the combined foundation phase of the [integration plan](../../SERVICE_CLIENT_PLAN.md).
Fluid summary tests, direct SharedTree package tests, and the SharedTree browser lifecycle trace now consume this package through the reusable `sea-driver` projection.
Browser benchmarks also use the neutral factories; low-level protocol harnesses are still being migrated.

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

The build script generates `memory`, `webtransport`, `combined`, `memory-compression`, and `webtransport-compression` artifacts in isolated output and Cargo target directories.
Each configuration builds with explicit features and no default features, producing both Node and web JavaScript targets.
The Node outputs for remote configurations do not provide a Node WebTransport implementation.
The combined artifact exists, but public loader presets and packaging comparisons remain stage 3 work.
Consumers must not import generated paths directly.

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
An emitted-module import-graph test checks lazy artifact imports and excludes unrelated capabilities and dependencies from each factory entrypoint.
`browser.html` runs plain and compressed remote sessions through the emitted package entrypoint.
With a running development server and certificate from the [browser harness](../../tests/webtransport-browser/README.md), run from `rust-service/`:

```bash
node tests/minimal-fluid-driver/browser/run-headless.mjs packages/sea-typescript <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __seaPackageResult browser.html
```

The existing runner is test orchestration only; this package has no dependency on the Fluid harness, driver, runtime, or SharedTree.
The caller owns the native service and its certificate/data cleanup; the runner owns its temporary Chromium profile and HTTP server.
An initial Chromium 152 run inside the Codespace passed both configurations with 2,800-byte blob and event payloads, snapshot publication, and reopening.
Local and remote tests also read compressed blobs through an undecorated observer to verify that the factory actually encodes stored bytes.
This is foundation evidence, not completion of consumer migration, split-preset acceptance, or inventory-app acceptance.

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

Remaining combined-stage work includes low-level binding consumer migration and removal of legacy binding ownership without losing transport-specific tests.
Legacy transport-owned generated exports remain until those consumers migrate; no stage-completion claim is made by these checks.