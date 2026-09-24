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
Connection identities and nonempty targets are limited to 256 bytes.
`SignalLimits` bounds payload and membership metadata sizes, live member count, and receiver queue capacity; all configured limits must be nonzero.
Reliable messages use bounded receiver queues; overflow terminates the slow receiver explicitly without blocking other recipients.
Best-effort messages may be discarded when a receiver queue is full.
Membership updates are always reliable and are never silently discarded.
The maximum queued payload memory per receiver is bounded by queue capacity times maximum payload size, in addition to bounded membership metadata and shared allocation overhead.
Admission copies identities, metadata, targets, and payloads into bounded backing allocations.
A small `Bytes` slice therefore cannot make the relay retain a larger caller-owned allocation.
Recipients share the admitted allocations; routing does not copy a payload for each recipient.

No message is persisted, assigned an event position, or replayed to a new connection.
Successful submission means local admission, not acknowledgment by recipients.
Delivery has no ordering relationship with document operations.
The current local relay processes messages in admission order, but applications must not rely on that for best-effort messages across transports.
Close or drop removes membership and wakes a pending receive; no archive authority is affected.
Applications own current-state repair and notification semantics.

## Validation

Run `cargo test -p sea-signals` from `rust-service/`.
Focused tests cover routing, initial membership, isolation, no replay, queue overflow, payload limits, and connection cleanup.

Native server and [browser harness](../../tests/webtransport-browser/README.md) tests cover reliable/datagram delivery, oversized fallback, generated bindings, and mixed QUIC/WebSocket recipients.
Fluid broadcast/targeted-signal tests exercise runtime delivery, not Presence convergence.
Compare initial live membership as a set, not historical join order.
See [Decision 0017](../../historical/decisions/0017-document-signals.md) for implementation history and compatibility boundaries.