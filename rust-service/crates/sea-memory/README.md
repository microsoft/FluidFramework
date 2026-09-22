# Sea Memory

`sea-memory` provides `MemoryStorage`, the process-local reference implementation of `sea_core::storage::SeaStorage`.

## Ownership

`create_view` allocates a process-unique document identity; `open_view` returns `None` for unknown identities and rejects competing openings.
Factory clones share the registry, and closed documents retain their complete histories while the registry lives.

Components and their clones share one exclusive opening; dropping the last releases writer ownership.
Reads retain data rather than writer ownership, regardless of their polling/completion state.
They survive reopening, and live reads receive appends from subsequent openings.

Availability handles have private, document-specific provenance and retain data, not writer ownership.
A new opening of the same document can validate old handles with `ensure_available` or mint fresh ones with `resolve`.
Handles from another document are rejected even when their content identities or event positions match.

## Publication and Reads

Blobs and directories deduplicate by content identity.
Every object reachable from a stored directory is also stored: publication requires all direct children to exist, and content is never removed or modified.
This invariant makes tree availability a single membership lookup, without traversing descendants.
The direct view establishes blob availability before appending a referencing event and both blob and event availability before publishing a snapshot.
Raw event components deliberately treat blob identities as opaque.
Reopening validates content closure, the complete event prefix, matching archive and item positions, and all snapshot dependencies.
It fails on inconsistent history rather than omitting records.

Event appends assign increasing positions starting at one and never deduplicate equal input.
Event batches publish under one archive lock and wake readers after releasing it.
Position exhaustion retains the successful prefix and stops at the first error; batches never return ambiguous outcomes.
The view retains a checked prefix when a later dependency is invalid.
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

Storage is process-local, with no persistence or pruning; document identities are not guaranteed unique across processes.
Data survives while the factory, components, streams, or availability handles retain the corresponding state; handles alone do not provide a factory or writer authority.
The factory retains every created document without eviction.

The primary entry point is `MemoryStorage`; its components and handles are exported from the crate root.
Shared laws come from [`sea-conformance`](../sea-conformance/src/lib.rs).
Local tests cover document invariants in [`document.rs`](src/document.rs) and archive bounds, progress, and subscription cleanup in [`memory_archive.rs`](src/memory_archive.rs).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-memory --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-memory --all-features --no-deps
```
