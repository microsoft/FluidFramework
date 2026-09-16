# Sea WebTransport

This crate owns the bounded, versioned Sea wire protocol, one platform-independent client implementation, native client transport, and generated browser/injected bindings.
Native and browser builds share framing, correlation, logical-stream state machines, recovery, and lifecycle behavior.
They differ only where their environments open connections and read or write bytes.

## Architecture

One archive-bound client connection uses four persistent logical streams:

- The **event stream** opens the logical session, returns opaque session authority, and carries atomic snapshot selection, finite catch-up, a caught-up marker, and live events.
- The **author stream** uses that authority for ordered submissions, receipts, ambiguity resolution, and close.
- The **snapshot stream** uses that authority for latest-value snapshot notifications and policy-bound publication.
- The **content stream** uses that authority for correlated bounded history, blob, directory, and snapshot lookup operations with explicit completion.

Each frame is length-delimited and contains an explicit `MessageKind`, stream-scoped correlation ID, and postcard-serialized kind-specific payload.
The decoder accepts fragmentation and coalescing, rejects unknown kinds and wrong-stream messages, and enforces `max_frame_bytes` before payload decoding.
Correlation ID zero is reserved for unsolicited event and snapshot notifications.

An **archive** is durable or process-local retained state.
A **logical session** is one connection-bound author identity within an archive.
A **logical stream** is one persistent WebTransport bidirectional stream with a single role.
A **client** owns one transport connection and the shared state for its logical streams.
The **protocol** is the versioned frame and message contract, not the server implementation or application adapter.

## Snapshot Participation

Snapshot coordination opens with one immutable policy:

- `ReadOnly` receives accepted-snapshot updates and cannot publish.
- `SeaSelected` publishes only while holding Sea's current nomination fence.
- `ClientSelected` publishes without a Sea fence because the application owns election and scheduling.

Any active client-selected publisher suppresses Sea selection.
When the last client-selected stream leaves, Sea deterministically nominates one active Sea-selected stream if available.
Nomination selects authority; it never requests or schedules snapshot generation.
See [Decision 0012](../../decisions/0012-fluid-snapshot-election-integration.md).

## Lifecycle And Ownership

`NativeSeaClient` pins a SHA-256 certificate hash and implements `SeaSession`.
Disconnect and reconnect are explicit; operations are never retried automatically.
Active frame reads and writes have deadlines, while an idle healthy stream does not inherit the operation deadline.
Connection loss releases author membership and snapshot participation according to server liveness policy.
Protocol or transport failure closes the owning connection without terminating the server endpoint.

The native listener, server dispatch, archive routing, connection liveness, measurements, and shutdown policy belong to the separate [`sea-webtransport-server`](../sea-webtransport-server/) crate.

## Targets And Generated Bindings

The `src/wasm/` library module exports browser and injected-transport bindings from the same shared client used by native Rust.
It is library code rather than a Cargo example because downstream applications consume generated bindings; there is no standalone scenario to run.

Generate the canonical web and Node packages with:

```bash
node crates/sea-webtransport/scripts/build-wasm.mjs
```

The command runs from `rust-service/` and writes production outputs to `crates/sea-webtransport/pkg/web/` and `crates/sea-webtransport/pkg/node/`.
The minimal Fluid driver, Node behavior tests, and real Chromium harness consume those locations directly.
The same command emits feature-gated process-local test bindings under `crates/sea-webtransport/test-support/pkg/`; production outputs exclude `sea-memory`, `sea-sequencer`, native endpoints, and server lifecycle code.
All generated files are build artifacts and must not be edited.

## Validation

Run from `rust-service/`:

```bash
cargo test -p sea-webtransport --all-targets --all-features
cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-webtransport --no-deps
```

The end-to-end browser setup is documented in the [browser harness](../../tests/webtransport-browser/README.md).
