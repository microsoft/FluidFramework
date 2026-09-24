# Sea Conformance

`sea-conformance` provides implementation-independent checks for `sea-core` storage and session contracts.

## Coverage

| Suite | Contract coverage | Consumers |
| --- | --- | --- |
| `run_view_conformance` | Exclusive opening, complete-tree publication, compatible handles after publication and reopening, distinct equal appends, snapshots, ordered bounded/live reads. | Memory and both file modes. |
| `run_snapshot_archive_conformance` | Exact/inclusive lookup, publication order, compatible handles, sparse bounds. | Memory and both file modes. |
| `run_session_conformance` | Explicit initialization and initial-state snapshot, conditional publication, distinct equal submissions, ordered replay, snapshot-plus-live loading, independent close. | Sequencer, compression, encryption. |

Foreign-handle and unavailable-dependency rejection, backend-specific future bounds, resource lifetimes, runtime ownership, cancellation settlement, reconciliation failures, publisher fencing, ambiguity, corruption, and durability require implementation-local tests.
Do not infer those properties from the memory backend or a conformance-suite pass.

Factories must be fresh for each invocation, and the session suite requires two fresh memberships sharing an empty document.
The suites panic on a contract violation and are intended to be invoked from an implementation's async tests.

## Relationships and Limits

Cross-layer stacks belong to [integration tests](../sea-integration-tests/README.md).
Server tests cover native transports across storage modes; [TypeScript tests](../../packages/sea-typescript/README.md#validation) and the [browser harness](../../tests/webtransport-browser/README.md) cover generated bindings and browser lifecycle.

See [`src/lib.rs`](src/lib.rs) for generic bounds and panic conditions.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-conformance
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-conformance --no-deps
```
