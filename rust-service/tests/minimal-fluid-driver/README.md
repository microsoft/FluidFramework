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
- The native server owns a bounded set of concurrent connection futures. The SharedTree Chromium trace uses three independent Fluid containers and three generated `BrowserClient` transport sessions. Each document service serializes access to its non-reentrant generated client; serialization is not shared across containers.
- Browser loading uses Fluid's `Fluid.Container.ForceWriteConnection` host gate. Default read-to-write reconnect cursor transfer is not implemented or claimed. Node contracts cover read-mode membership plus disconnected-before-commit and committed-after-response-loss recovery.

## Validation

The package is registered in the root pnpm workspace. Build `@fluidframework/core-interfaces` and `@fluidframework/driver-definitions` first so their generated declarations exist, then validate the package through its pnpm scripts.

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

For Chromium, generate `--target web` bindings into this package's ignored `pkg/`, generate the existing browser harness certificate, start `fluid-webtransport-native`, build the SharedTree bundle, and run:

```bash
pnpm run typecheck:shared-tree
pnpm run build:shared-tree
node browser/run-headless.mjs "$PWD" <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __sharedTreeResult shared-tree.html
```