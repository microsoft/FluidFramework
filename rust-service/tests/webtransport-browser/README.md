# WebTransport browser validation

This harness runs the browser-WASM client against the native HTTP/3 server without disabling certificate validation. The generated ECDSA P-256 certificate is valid for 13 days, and both clients pin its SHA-256 digest. Generated certificates, private keys, service data, browser profiles, evidence, and WASM bindings are ignored.

Run all Cargo commands from an exact disposable copy of `rust-service`, add `crates/protocol`, `crates/service`, `crates/wrappers/webtransport-native`, and `crates/wrappers/webtransport-browser` to that copy's workspace members, and use isolated `CARGO_TARGET_DIR` values. The source root manifest and lockfile must remain unchanged.

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

`wireBytes` counts encoded FSP4 request and response bytes. Browser APIs do not expose HTTP/3, QUIC, UDP, or TLS byte totals, so the harness does not mislabel application bytes as network overhead. The process transport uses a separate protocol with a four-byte length prefix; its byte count is therefore not directly comparable to FSP4 without packet capture.
