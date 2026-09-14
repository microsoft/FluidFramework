# Fluid Native Service

`fluid-native-service` assembles the FSP4 protocol, authoritative sequencer, append and snapshot storage, content-addressed blobs and summaries, and projected-operation subscriptions into a single-host service.

## Ownership and routing

Each document owns an independent log, sequencer state, fence, snapshots, and projected-operation notification channel. Unary document requests route by their embedded document identifier. Blob and summary content is service-wide. Transport adapters remain responsible for framing long-lived connections and binding submission streams to one document.

`NativeService::handle` converts internal classified failures into stable protocol `ErrorCode` values. `subscribe_projected` registers its notification receiver before catch-up reads, so accepted operations across the catch-up/tail boundary remain observable. A subscription resumes by canonical cursor, recovers from notification lag by reading again, and reports cancellation before yielding another pending operation.

## Storage modes

- `Memory` keeps document and content state in process memory and is intended for tests or ephemeral use.
- `BufferedFile` uses the simple file backend without deployment-level fencing or durable append acknowledgement.
- `DurableFile` is the default and uses the durable-log backend plus a persisted same-host fencing epoch.

File-backed modes store document state beneath `ServiceConfig::root`. Durable content blobs and summaries are stored beneath the same root. The service is a single-host assembly; the file authority is not a distributed coordination mechanism.

## Typical flow

1. Create a document.
2. Open a fresh writer session at an initial or known reference.
3. Submit operations with stable submission identities and contiguous local sequence numbers.
4. Read accepted projected operations or subscribe after an opaque cursor.
5. Resolve ambiguous submission identities instead of blindly retrying with changed content.

## Validation

From `rust-service/`:

```bash
cargo test -p fluid-native-service
cargo rustc -p fluid-native-service --lib -- -D missing-docs
RUSTDOCFLAGS="-D warnings" cargo doc -p fluid-native-service --all-features --no-deps
```

Tests cover all storage modes, isolated documents, stale-session rejection before append, snapshot restart recovery, stale-owner fencing, cursor validation, projected subscription catch-up, lag recovery, document binding, and cancellation.
