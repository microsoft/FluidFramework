# WASM client package validation

The `fluid-webtransport-browser` crate generates one TypeScript-facing WASM package with two clients:

- `InjectedClient` is environment-neutral. Its `AsyncRequestTransport.request` method receives a validated complete FSP4 request and returns a promise for a complete FSP4 response. The WASM core validates response framing and request identity and owns bounded request/lifecycle state.
- `BrowserClient` retains the browser WebTransport adapter, certificate pinning, stream I/O, explicit disconnect, and explicit reconnect behavior.

Build and test the Node distribution from `rust-service/` with an isolated target:

```bash
CARGO_TARGET_DIR=/tmp/fluid-wasm-client-target \
  RUSTFLAGS='--cfg=web_sys_unstable_apis' \
  cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release
wasm-bindgen /tmp/fluid-wasm-client-target/wasm32-unknown-unknown/release/fluid_webtransport_browser.wasm \
  --target nodejs --out-name fluid_webtransport_browser --out-dir tests/wasm-client/pkg
node --test tests/wasm-client/node-test.mjs
```

The generated `pkg/` bindings, declarations, and WASM binary are ignored validation artifacts. Release automation may publish equivalent generated browser and Node distributions, but generated output is not committed.