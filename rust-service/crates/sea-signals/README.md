# Sea Signals

An in-memory relay for opaque, document-scoped messages.
Each `SignalRoom` is one isolated routing domain; the host owns document lookup and authorization.
The crate has no storage, sequencer, network, or Fluid dependency.

## Contract

`SignalRoom::connect` binds a unique live connection identity and public metadata.
The first received event contains current members, including self.
Registration and that snapshot are atomic with subsequent joins, departures, and messages.
Broadcast includes the sender; targeted messages reach only a matching live member.
A missing target is a successful no-op, not an offline mailbox.

Payloads are opaque and bounded.
Reliable messages use bounded receiver queues; overflow terminates the slow receiver explicitly without blocking other recipients.
Best-effort messages may be discarded when a receiver queue is full.
Membership updates are always reliable and are never silently discarded.
The maximum queued payload memory per receiver is bounded by queue capacity times maximum payload size, in addition to bounded membership metadata and shared allocation overhead.

No message is persisted, assigned an event position, or replayed to a new connection.
Successful submission means local admission, not acknowledgment by recipients.
Delivery has no ordering relationship with document operations.
The current local relay processes messages in admission order, but applications must not rely on that for best-effort messages across transports.
Close or drop removes membership and wakes a pending receive; no archive authority is affected.
Applications own current-state repair and notification semantics.

## Validation

Run `cargo test -p sea-signals` from `rust-service/`.
Focused tests cover routing, initial membership, isolation, no replay, queue overflow, payload limits, and connection cleanup.

Integration evidence for the signal implementation on branch `sea-signals`, based on `50d1553fcb0`:

| Boundary | Check | Result |
| --- | --- | --- |
| Relay | `cargo test -p sea-signals` | Five tests passed, including canceled receive, concurrent receive rejection, and close wakeup. |
| Transport codec/client | `cargo test -p sea-webtransport --lib` | Twenty tests passed, including signal payload round trips and bounded queue policy. |
| Native composition | `signals_cross_native_connections_without_archive_events` | Reliable, targeted, small best-effort, and oversized fallback passed without archive events. |
| Generated local binding | `sea-typescript/test/session.test.mjs` | Broadcast, targeting, unchanged history, and closing a pending read passed. |
| Browser composition | `SEA_BROWSER_SKIP_BUILD=1 SEA_ORDINARY_WEBSOCKET=1 tests/webtransport-browser/run-test.sh` | Chromium passed mixed QUIC/WebSocket routing in both directions and oversized fallback. |
| Workspace | Canonical commands in [DEVELOPMENT.md](../../DEVELOPMENT.md), plus WASM Clippy | 168 Rust tests, strict lint/docs, build, and `./test.sh` passed. |
| Repository | Root `pnpm build:fast` and `pnpm policy-check --path rust-service` | Passed. |

The adjacent Fluid adapter also passed all seven existing `TestSignals` and `Targeted Signals` E2E cases against Sea's ordinary WebSocket listener.
Those checks exercise runtime delivery, not a separate Presence convergence suite.
One unchanged idle-stream timeout test failed during the first full Rust run, then passed both in isolation and in the full rerun.
The full Node harness exposed an audience-order assumption; its assertion now compares the current member set rather than imposing historical join order on a live snapshot.