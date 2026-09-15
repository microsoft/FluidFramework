# In-process browser service transport

This WASM-only crate adapts a memory-backed native Fluid service to the JavaScript transport contract consumed by `InjectedClient` in [`sea-webtransport-browser`](../sea-webtransport-browser/README.md).

`LocalServiceTransport.request` accepts and returns one complete bounded FSP4 frame without crossing a network boundary. Projected subscriptions use a separate lazy `LocalProjectedSubscription`. Unary subscription requests and non-subscription stream requests are rejected. The transport's `cancel`, `disconnect`, and `shutdown` hooks intentionally do nothing because there is no network session; dropping the transport owns service teardown. Subscription cancellation is forwarded after the subscription has been initialized.

The package is compiled only for `wasm32`. Run from `rust-service/`:

```bash
RUSTFLAGS='--cfg=web_sys_unstable_apis' cargo build --locked \
  -p sea-service-browser --target wasm32-unknown-unknown
```

Generated JavaScript, TypeScript declarations, and WASM binaries are validation artifacts and must not be edited or committed.
