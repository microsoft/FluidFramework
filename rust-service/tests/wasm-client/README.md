# Generated Sea WASM validation

The `sea-webtransport` library target generates canonical TypeScript-facing web and Node packages with two production entry points:

- `SeaInjectedClient` accepts a JavaScript transport implementing the Sea request and stream boundary.
- `SeaBrowserTransport` connects to the native `/sea` WebTransport endpoint with certificate pinning.

Feature-gated `SeaLocalService` and `SeaLocalClient` bindings run a process-local sequencer only in the separate test-support packages.

Generated clients expose typed session methods for events, stable submission recovery, blobs, directories, snapshots, load, reads, and lifecycle.
JavaScript does not construct or parse Sea protocol frames.

Build all generated distributions and test the Node distribution from `rust-service/`:

```bash
pnpm --dir tests/minimal-fluid-driver run build:wasm
node tests/wasm-client/node-test.mjs
```

The crate-owned build script compiles the `sea-webtransport` library `cdylib` and runs the pinned `wasm-bindgen` CLI for web and Node targets.
Canonical production artifacts are under `crates/sea-webtransport/pkg/`; explicit local test support is under `crates/sea-webtransport/test-support/pkg/`.
Generated bindings and WASM binaries are ignored validation artifacts.