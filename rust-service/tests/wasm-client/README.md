# Generated Sea WASM validation

The `sea-webtransport` browser example generates one TypeScript-facing WASM module with four entry points:

- `SeaLocalService` and `SeaLocalClient` run a process-local sequencer over memory storage.
- `SeaInjectedClient` accepts a JavaScript transport implementing the Sea request and stream boundary.
- `SeaBrowserTransport` connects to the native `/sea` WebTransport endpoint with certificate pinning.

Generated clients expose typed session methods for events, stable submission recovery, blobs, directories, snapshots, load, reads, and lifecycle.
JavaScript does not construct or parse Sea protocol frames.

Build all generated distributions and test the Node distribution from `rust-service/`:

```bash
pnpm --dir tests/minimal-fluid-driver run build:wasm
node tests/wasm-client/node-test.mjs
```

The build script compiles the `sea-webtransport-browser` example and runs the pinned `wasm-bindgen` CLI for web and Node targets.
Generated `pkg/` bindings and WASM binaries are ignored validation artifacts.