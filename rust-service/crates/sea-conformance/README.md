# Sea Conformance

`sea-conformance` provides implementation-independent checks for `sea-core` storage and session contracts.

## Coverage

`run_view_conformance` checks the replacement factory/view workflow: exclusive opening, content availability, distinct equal appends, snapshot selection, bounded replay, initially empty live loading, live suffix delivery, reopening, and retained history.
`run_snapshot_archive_conformance` checks exact and inclusive snapshot lookup, strict publication ordering, compatible returned handles, and sparse range bounds.
These functions accept a document factory and are exercised by memory, buffered-file, and durable-file backends.
`run_session_conformance` accepts two memberships in one replacement runtime and checks explicit initial-state publication, stable event retries, snapshot-plus-live replay, bounded ordering, and independent session close.
It is exercised by `sea-sequencer`; backend ambiguity, cancelled mutation settlement, publisher fences, and backend-specific ownership are localized there rather than assumed from the memory backend.
They do not impose a backend's future-bound policy, handle ownership policy, cancellation settlement mechanism, or durability behavior; those require localized tests.

Sparse bounds, observed progress, and bounded versus live delivery also have localized tests in the owning memory and file archive implementations.

Factories must be fresh for each invocation, and the session suite requires two fresh memberships sharing an empty document.
The suites panic on a contract violation and are intended to be invoked from an implementation's async tests.

## Relationships and Limits

The memory, buffered-file, and durable-file packages run the Sea storage suite.
`sea-sequencer` runs the session suite process-locally.
Separate `sea-webtransport-server` integration tests exercise native live delivery and snapshot publication against every built-in storage mode; they do not invoke this shared session suite.
Compression, encryption, and stateful-compression run the same session suite over a local sequencer.
The generated Node suite separately covers the single-threaded WASM local client and pending-read cancellation.
The Chromium harness covers `SeaInjectedClient` over `SeaBrowserTransport`, including its browser-only persistent submission stream, cancellation, disconnect, and reconnect behavior.
Implementation-specific persistence, corruption, durability, and fault behavior still require local tests; passing this package does not establish those properties.

See [`src/lib.rs`](src/lib.rs) for generic bounds and panic conditions.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-conformance
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-conformance --no-deps
```
