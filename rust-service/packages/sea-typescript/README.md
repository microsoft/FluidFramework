# @fluidframework/sea-typescript

This package provides non-Fluid-specific SEA sessions through package-owned WASM artifacts.
Its APIs are internal and under active development in the combined foundation phase of the [integration plan](../../SERVICE_CLIENT_PLAN.md).
Existing Fluid-driver and direct SharedTree consumers have not yet migrated to this package.

## Supported Foundation

The current entrypoint supports independent memory services and real browser WebTransport sessions.
Both use the same Rust session bindings and can explicitly enable the existing compression decorator.
Sessions expose opaque event submission and resolution, monitored history, immutable blobs and directories, and snapshot coordination, publication, and loading.
Automatic reconnect, implicit retries, authentication, and arbitrary runtime decorator composition are not provided.

```typescript
import { createMemoryService } from "@fluidframework/sea-typescript/internal";

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
Stream reads are sequential; a second concurrent read is rejected.

Session-operation failures retain their Rust SEA category in an error's `kind` field.
Input and factory-open failures currently provide diagnostic errors without a uniform category; a complete public error contract remains foundation work.
No error or cancelled wait establishes that an ambiguous write did not commit.

## Validation

From the repository root:

```bash
pnpm --dir rust-service/packages/sea-typescript run build
pnpm --dir rust-service/packages/sea-typescript test
```

The Node tests use the package entrypoint and cover sharing, isolation, compression, immutable content, events, snapshot reload, cancellation, and capability rejection.
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

Remaining combined-stage work includes consumer migration, optional content references on submissions, direct snapshot lookup, complete typed factory errors, in-flight operation/close lifecycle coverage, and incremental missing-artifact rebuild checks.
The existing consumers still use the legacy transport-owned generated API; no stage-completion claim is made by these checks.