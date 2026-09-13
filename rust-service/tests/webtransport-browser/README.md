# WebTransport browser validation

This harness runs the `BrowserClient` adapter from the same WASM package as the environment-neutral `InjectedClient` against the native HTTP/3 server without disabling certificate validation. The generated ECDSA P-256 certificate is valid for 13 days, and both clients pin its SHA-256 digest. Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run all Cargo commands from `rust-service/` with isolated `CARGO_TARGET_DIR` values. The required crates are registered in the workspace; validation must leave the root manifest and lockfile unchanged.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build -p fluid-webtransport-browser --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/fluid_webtransport_browser.wasm \
  --target web --out-name fluid_webtransport_browser --out-dir tests/webtransport-browser/pkg
sh tests/webtransport-browser/generate-cert.sh tests/webtransport-browser/.certs
cargo run -p fluid-webtransport-native --bin fluid-webtransport-native -- \
  127.0.0.1:0 tests/webtransport-browser/.certs/cert.pem \
  tests/webtransport-browser/.certs/key.pem tests/webtransport-browser/artifacts/service-data
node tests/webtransport-browser/run-headless.mjs tests/webtransport-browser \
  https://127.0.0.1:<printed-port>/fluid \
  "$(cat tests/webtransport-browser/.certs/cert.sha256)"
```

The browser flow exercises document/session operations, projected reconnect behavior, ordered submission-stream responses, write-side close, one-shot response EOF, blob upload/fetch, and summary publish/fetch against the native service. It pipelines three submissions before reading their responses, then verifies that a terminal stream error exposes EOF once and remains terminal. Blob and summary fetches validate the echoed digest before exposing content to JavaScript.

`wireBytes` counts encoded FSP4 request and response bytes. Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not mislabel application bytes as network overhead. The process transport uses a separate protocol with a four-byte length prefix; its byte count is therefore not directly comparable to FSP4 without packet capture.
