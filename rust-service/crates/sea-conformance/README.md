# Sea Conformance

`sea-conformance` provides implementation-independent checks for `sea-core` storage and session contracts.

## Coverage

| Suite | Contract coverage | Consumers |
| --- | --- | --- |
| `run_view_conformance` | Exclusive opening, content dependencies, distinct equal appends, snapshots, bounded/live reads, reopening. | Memory and both file modes. |
| `run_snapshot_archive_conformance` | Exact/inclusive lookup, publication order, compatible handles, sparse bounds. | Memory and both file modes. |
| `run_session_conformance` | Initial-state publication, ordered events, snapshot/live replay, independent close. | Sequencer, compression, encryption. |

Backend-specific bounds, ownership, cancellation settlement, ambiguity, corruption, and durability require local tests.
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
