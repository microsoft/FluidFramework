# Browser WebTransport client

This WASM-only crate exposes FSP4 clients to JavaScript without changing protocol frames.

`InjectedClient` accepts an `AsyncRequestTransport`, making lifecycle and framing behavior testable outside a browser. It validates complete request and response frames, permits one active unary request, and never retries. Cancellation, disconnect, reconnect, and shutdown are explicit. `BrowserClient` supplies the real browser WebTransport adapter with SHA-256 certificate pinning, a fresh bidirectional stream per unary request, explicit reconnect, projected subscriptions, and document-bound ordered submission streams.

Submission-stream writes wait for browser transport backpressure. Responses remain ordered by request ID; concurrent reads or writes are rejected. Closing ends only the write side after queued writes. Subscription cancellation releases its reader. Unary responses and streamed frames are bounded by the configured FSP4 maximum. Metrics count encoded FSP4 bytes, not HTTP/3, QUIC, UDP, or TLS overhead.

The hand-authored TypeScript transport interfaces live in `src/lib.rs`. Generated bindings are ignored artifacts and must not be edited. See the [Node WASM harness](../../../tests/wasm-client/README.md) and [browser harness](../../../tests/webtransport-browser/README.md) for fresh-consumer commands.

Run the Rust target check from `rust-service/`:

```bash
RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --locked \
  -p fluid-webtransport-browser --target wasm32-unknown-unknown
```