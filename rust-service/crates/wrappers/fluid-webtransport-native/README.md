# Native WebTransport service adapter

This crate serves and consumes unchanged FSP4 frames over HTTP/3 WebTransport.

`WebTransportServer` accepts sessions only on `/fluid`, bounds concurrent connections and streams, and dispatches unary requests, projected subscriptions, and document-bound submission streams to `NativeService`. A unary request occupies one bidirectional stream and requires request-side EOF before dispatch. Submission streams accept ordered submissions until EOF or a terminal error. Projected subscriptions stop when the peer closes the send stream, the service terminates, or writing fails.

`WebTransportClient` pins a SHA-256 certificate hash. It opens a fresh reliable bidirectional stream per unary request and provides a dedicated projected-subscription stream. Disconnect and reconnect are explicit; operations are never retried automatically. `TransportMeasurement` counts encoded FSP4 bytes and transport concurrency, excluding HTTP/3, QUIC, UDP, and TLS overhead.

Server shutdown first stops acceptance. `Immediate` cancels owned connections; `Drain` allows existing connections to finish until its deadline and then cancels the remainder. The returned `ShutdownOutcome` records which path completed.

Run from `rust-service/`:

```bash
cargo test -p fluid-webtransport-native --all-targets --all-features
cargo clippy -p fluid-webtransport-native --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p fluid-webtransport-native --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../../tests/webtransport-browser/README.md).