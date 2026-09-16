# Sea Conformance

`sea-conformance` provides implementation-independent checks for `sea-core` storage contracts.

## Coverage

`run_sea_storage_conformance` checks blob and directory identity, missing-tree rejection, event ordering, initial and historical snapshots, conditional and idempotent snapshot publication, publication resolution, and snapshot-plus-tail load.
`run_sea_session_observable_behavior` checks the current `SeaSession` contract for submission and publication identity recovery, bounded and recovery reads, live snapshot notifications, content access, and close behavior.

Factories must return a fresh, empty stream for each call, and the session suite requires a fresh archive session.
The suites panic on a contract violation and are intended to be invoked from an implementation's async tests.

The legacy append-stream laws map to the current contracts as follows:

| Legacy law | Current disposition |
| --- | --- |
| Append order, empty payloads, and exclusive resume boundaries | Ported to `run_sea_storage_conformance`. |
| Concurrent append completeness | Ported to `run_sea_storage_conformance`. |
| Finite reads and reads after the current head | Ported to `run_sea_storage_conformance`. |
| Independent reader cancellation | Ported to `run_sea_storage_conformance`; network cancellation has separate transport tests. |
| Committed position validation | Ported to `run_sea_storage_conformance`. |
| Snapshot position, parent, and monotonicity validation | Ported to `run_sea_storage_conformance` using content-addressed roots. |
| Snapshot recovery | Covered by the atomic snapshot-plus-tail storage load and the session observable-behavior suite. |
| Position codec round trip | Replaced by the canonical `EventPosition::to_bytes` and `EventPosition::from_bytes` assertion. The obsolete fallible token codec was removed. |
| Deterministic mixed legacy model trace | Not mechanically ported because it combines the obsolete inline-snapshot value model with laws covered independently above. Deterministic current-API workloads remain in `sea-benchmarks`. |

## Relationships and Limits

The memory, buffered-file, and durable-file packages run the Sea storage suite.
`sea-sequencer` runs the session suite process-locally, while `sea-webtransport-server` runs it through `NativeSeaClient` against every built-in storage mode.
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