# Sea Memory

`sea-memory` provides `MemoryStorage`, the process-local reference implementation of `sea_core::next::SeaStorage`.

## Behavior

`create_view` allocates a process-unique document identity; `open_view` returns `None` for unknown identities and rejects competing openings.
Factory clones share the registry, and closed documents retain their complete histories while the registry lives.

Blob, event, and snapshot components and their clones share one exclusive opening.
The opening owns the document; writable components access their data through that opening rather than pairing data with a separate lifetime token.
Dropping the last component or component clone releases writer ownership, even when reads remain alive.
Reads retain data, not the opening: event reads keep their event archive, while snapshot reads also retain the document needed to resolve snapshot dependencies.
Unpolled, live, failed, and completed reads do not prevent reopening.
Dropping a view or reopening the document does not invalidate its reads; live reads continue receiving appends from subsequent openings.

Availability handles have private, document-specific provenance and retain data, not writer ownership.
A new opening of the same document can validate old handles with `ensure_available` or mint fresh ones with `resolve`.
Handles from another document are rejected even when their content identities or event positions match.

Blobs and directories deduplicate by content identity.
Every object reachable from a stored directory is also stored: publication requires all direct children to exist, and content is never removed or modified.
This invariant makes tree availability a single membership lookup, without traversing descendants.
The direct view establishes blob availability before appending a referencing event and both blob and event availability before publishing a snapshot.
Raw event components deliberately treat blob identities as opaque.
Reopening validates content closure, the complete event prefix, matching archive and item positions, and all snapshot dependencies.
It fails on inconsistent history rather than omitting records.

Event appends assign increasing positions starting at one and never deduplicate equal input.
Snapshots are sparse, strictly increasing publications at their event handle's position, with exact and optional inclusive-bound lookup.
There is no initial empty-state snapshot.

Reads initialize on first poll; initialization errors are stream items, not errors from `read`.
Finite reads use exclusive lower and inclusive upper bounds, including bounds without a snapshot at that position.
Nonempty reads reject either bound beyond the archive's initialization head (including any bound on an empty archive).
Ranges with both bounds and `after >= stop_after` complete without data, even for future bounds.

Unbounded reads replay retained data and wait for appends without a captured-head cutoff or broadcast-loss window.
Progress advances `previous` only on delivery, discovers the latest in-range position, and reports `FallenBehind` when more than one unread entry has accumulated.
Dropping a read cancels its subscription without affecting other readers.
`load` selects a snapshot using `LoadStart` and returns the live event suffix; it does not capture an atomic event head.

Durability is `Durability::Memory`.
Appends have no internal suspension or detached work: an unpolled future has no effect; once polled, its mutation settles synchronously under the component lock before returning.
No operation returns an ambiguous outcome or retries an append.

## Limits

There is no persistence, crash recovery, pruning, outage simulation, or cross-process document identity guarantee.
Data survives while the factory, components, streams, or availability handles retain the corresponding state; handles alone do not provide a factory or writer authority.
The factory retains every created document without eviction.
Session policy, application operation identities, and reconciliation belong above the view.
This implementation is suitable for tests, examples, and process-local state, not crash recovery.

The primary entry point is `MemoryStorage`; its components and handles are exported from the crate root.
Shared replacement laws come from [`sea-conformance::next`](../sea-conformance/src/next.rs).
Localized tests in [`document.rs`](src/document.rs) exercise provenance, opening lifetimes, cancellation, concurrent appends, position exhaustion, shared-tree closure, lazy/live reads, and inconsistent-history rejection.
Tests in [`memory_archive.rs`](src/memory_archive.rs) cover append-only assertions, sparse bounds and progress, finite completion, and weak subscription cleanup.

## Transitional API

`MemoryStream` still implements the old `sea_core::archive::SeaStorage` for consumers awaiting migration.
It is separate state and code, not an adapter beneath `MemoryStorage`.
Its finite captured-head loads, initial snapshots, conditional publication, and stable publication identities are old-model semantics only.
Checkpoint 3 of the [core migration plan](../../CORE_MIGRATION_PLAN.md) owns its removal after dependent consumers migrate.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-memory --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-memory --all-features --no-deps
```
