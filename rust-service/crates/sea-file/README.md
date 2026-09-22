# Sea File

`sea-file::storage::FileStorage` implements `sea_core::storage::SeaStorage` with buffered filesystem documents.
`FileStorage::<false>::open(root)` creates or opens a namespace; `create_view` allocates a document and `open_view` exclusively recovers one.
The same engine supplies synchronized storage to `sea-file-durable` through `FileStorage<true>`.

## Persistence Model

Each document has one dependency-ordered checksummed journal containing immutable content, events, and snapshots.
Frames contain a length, its complement, a BLAKE3 content hash, and the record bytes.
The format is incompatible with the transitional journal; migrate before reuse.
Buffered writes reach the operating system before returning but are not synchronized, so their durability is `Durability::Buffered`.
Durable mode appends to the journal and synchronizes it before acknowledgment, once per event batch.
Durable creation synchronizes a temporary file, renames it, and synchronizes the namespace and newly created ancestors.
Its [power-loss model](../sea-file-durable/README.md#power-loss-model) requires durable-prefix integrity, crash-atomic rename, and truthful synchronization; filesystem/device qualification remains outstanding.

Recovery verifies framing, content identities, transitive directory closure, a dense event prefix, and strictly advancing snapshot dependencies before exposing components.
Buffered recovery rejects incomplete tails; durable recovery truncates an incomplete final frame and synchronizes the repaired journal.
Complete corrupt frames or missing required dependencies fail recovery rather than producing gaps.
An unpublished creation `.pending` file is discarded even if it contains valid frames.
Durable reopening synchronizes the selected journal and parent directory before exposing records, including complete frames whose acknowledgment was lost.
Raw event components treat tree identities as opaque, while the view establishes availability before publication; raw writes with absent dependencies therefore make subsequent recovery fail.
Snapshots persist only position/root identities, not handles or session publication metadata.

Blob and directory content is immutable and deduplicated; directory publication checks child availability before modifying the journal.
Events are never deduplicated or retried, and snapshots must advance their event position.
Session retry identities and conditional snapshot policy remain above storage.

Event batches become visible together only after writing and, in durable mode, synchronization.
Empty batches perform no I/O; pre-write rejection attempts no entries.
An uncertain batch returns `Ambiguous` for every submitted entry because recovery may retain any prefix, including all entries.
Process the entire error suffix, not just its first error, and never automatically retry it.

## Ownership And Reads

Both modes use an exclusive OS lock on a stable `.lock` sidecar, including across independently opened factories.
The sidecar is never replaced or removed, so ownership survives replacement of the journal inode.
Components, their clones, all derived reads, and pending blocking workers retain the same opening; even unpolled or completed streams must be dropped before reopening.
Handles contain private canonical-document provenance but retain no writer ownership.
After reopening, compatible handles can be revalidated against membership; foreign-document handles are rejected even for equal identities.
Do not rename, replace, or externally modify files in an active namespace.
Stop all old writers before upgrading: older binaries lock the journal itself and do not participate in sidecar locking.
Journal record encoding is unchanged, but mixed-version writers are unsupported.

Reads initialize lazily and register wakeups under the published-state lock.
Mutations serialize separately in dependency order; event-batch disk I/O leaves the previously published prefix readable.
In-memory publication briefly holds the state lock.
Finite ranges have exclusive lower and inclusive upper bounds, including sparse snapshot bounds.
Nonempty ranges reject bounds beyond their initialization head; reversed/equal ranges complete without waiting.
Progress advances only with delivery, reports backlog, and remains coherent when discovering new appends.
Normal commits and uncertain writes wake readers outside the state lock; uncertain openings terminate reads with an error.

## Cancellation And Failures

Event appends require an active Tokio runtime and use one `spawn_blocking` task per nonempty batch, including single-event appends.
The worker owns the inputs and retains the opening until work finishes; dropping the caller future does not stop an admitted worker or release its exclusive OS lock.
An unpolled mutation has no effect, and an empty batch starts no worker.
Returned batch results establish settlement: a subsequent successful head bounds every returned result, including errors.
Cancellation alone does not establish settlement, and a concurrent head may precede later publication by the cancelled worker.
There is no public cancelled-worker join operation: drop all components and streams, then successfully reopen the document to establish settlement through exclusive locking and recovery.
Reopening returns `Busy` while a retained worker still owns the opening; this is not permission to retry the append.
A rejected input does not append a record.
An I/O error after writing begins is `Ambiguous` and poisons the opening: later writes, heads, resolutions, and lookups fail until all opening owners are dropped and recovery succeeds.
Worker panics and join failures also poison the opening and wake readers, even after caller cancellation.
Poisoning blocks authoritative observations during unwinding, before explicit failure notification.

## Limits

The complete journal is recovered into memory, history is never pruned, and namespace allocation searches for an unused numeric filename.
Namespace opening, document creation/recovery, blob/directory writes, and snapshot appends still perform synchronous I/O and can block the calling executor.
Blob/directory writes and snapshot appends also synchronously wait for the journal writer mutex and hold the state mutex across their own I/O; reads may wait behind those barriers or an in-memory publication, but not event-batch disk I/O.
Mutations write only new frames without replacing the journal inode; encoding memory is proportional to batch size.
Distributed filesystems, external file replacement, and writes through buffered mode are outside the durable guarantee.
Malformed lengths and complete checksum failures are errors, including at the final frame.
Checksums cannot distinguish a torn unacknowledged record from damaged acknowledged history; only structurally incomplete tails are repairable under the durable model.

See [`src/storage.rs`](src/storage.rs) for components and localized tests, and [`src/journal.rs`](src/journal.rs) for framing and fault boundaries.
Shared view and sparse-archive laws come from [`sea-conformance`](../sea-conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-file --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file --all-features --no-deps
```

Tests cover framing/corruption, batch visibility and uncertainty, lost acknowledgments, cross-process locks, executor progress during event I/O, and cancellation/panic ownership.
