# Minimal WASM Fluid driver

This isolated package adapts the generated `fluid-webtransport-browser` WASM package to the smallest Fluid driver surface exercised by the iteration trace. It does not decode FSQ2. TypeScript constructs only the documented FSP4 create, open-session, submit, latest-snapshot, and publish-snapshot envelopes that the generated package validates; projected reads, ambiguity resolution, blobs, and summaries use generated WASM methods.

## Implemented interfaces

- `IDocumentServiceFactory`: create with an optional full summary and load by resolved URL.
- `IDocumentService`: storage, bounded delta storage, and explicit delta connection creation.
- `IDocumentStorageService`: versions, snapshot trees, immutable blob create/read, full summary upload/download.
- `IDocumentDeltaStorageService`: bounded projected pages filtered to the requested sequence interval.
- `IDocumentDeltaConnection`: submission and operation events through explicit `synchronize()` calls.
- Explicit lifecycle extensions: `waitForIdle()`, `disconnect()`, `reconnect()`, `recoverPending()`, and caller-driven `resubmitPending()`.

## Unsupported interfaces and semantics

- Signals, nacks, presence, automatic live-tail polling, automatic reconnect, hidden retry, offline merge, summary handles, summary attachments, loading groups, and GC/retention guarantees.
- Summary upload accepts full trees only. Incremental handle reuse and parent concurrency are not implemented.
- `getSnapshot`, caching, auth, production certificates, Routerlicious, and ODSP compatibility are not implemented or claimed.
- The native server accepts one WebTransport session at a time because `WebTransportServer::serve` awaits `serve_connection` before its next `accept`. The Chromium trace therefore uses two logical Fluid delta clients over one generated `BrowserClient` and serializes requests to its capacity-one queue. Node contracts use distinct generated `InjectedClient` instances and cover concurrent logical submission plus disconnect-after-commit ambiguity. A true two-session Chromium trace requires the native service integration owner to spawn accepted connections concurrently.

## Validation

The package is intentionally not registered in the root pnpm workspace because registration and shared lockfiles belong to integration. Build `@fluidframework/core-interfaces` and `@fluidframework/driver-definitions` first so their generated declarations exist. The local `tsconfig.json` maps only those type-only imports.

From the repository root:

```bash
node node_modules/@fluidframework/build-tools/dist/fluidBuild/fluidBuild.js --root "$PWD" --vscode packages/common/driver-definitions
cd rust-service
CARGO_TARGET_DIR=/tmp/fluid-minimal-driver-wasm-target \
  RUSTFLAGS='--cfg=web_sys_unstable_apis' \
  cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release
wasm-bindgen /tmp/fluid-minimal-driver-wasm-target/wasm32-unknown-unknown/release/fluid_webtransport_browser.wasm \
  --target nodejs --out-name fluid_webtransport_browser --out-dir tests/wasm-client/pkg
cd tests/minimal-fluid-driver
pnpm run check:format
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm test
```

For Chromium, generate `--target web` bindings into this package's ignored `pkg/`, generate the existing browser harness certificate, start `fluid-webtransport-native`, and run:

```bash
node browser/run-headless.mjs "$PWD" <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS>
```