# Sea File

`sea-file::storage::FileStorage` implements the replacement `sea_core::storage::SeaStorage` with buffered filesystem documents.
`FileStorage::<false>::open(root)` creates or opens a namespace; `create_view` allocates a document and `open_view` exclusively recovers one.
The same engine supplies synchronized storage to `sea-file-durable` through `FileStorage<true>`.
Neither mode forwards through the old backend.

## Persistence Model

Each document has one dependency-ordered checksummed journal containing immutable content, events, and snapshots.
Frames contain a length, its complement, a BLAKE3 content hash, and the record bytes.
The replacement format is distinct from the transitional journal; there is no legacy reader or negotiation.
Buffered writes reach the operating system before returning but are not synchronized, so their durability is `Durability::Buffered`.
Durable mode appends to the journal and synchronizes it before acknowledgment, once per event batch.
It requires durable-prefix integrity: later appends and interrupted-tail truncation must not damage previously synchronized bytes, even in a shared final sector.
Document creation uses a synchronized temporary file, rename, and parent-directory synchronization; namespace creation synchronizes its ancestors.

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

Event batches use the same frame encoding and append engine as individual writes.
All in-memory entries become visible under the published-state lock only after the group write and, in durable mode, synchronization succeed.
An empty batch performs no I/O.
Pre-write rejection returns one error and attempts no entries.
An uncertain group returns `Ambiguous` for every submitted entry: recovery may retain any prefix of that group, including all entries.
Consumers must process the entire error suffix, not stop at its first error, and must never automatically retry it.
This follows the shared `Archive::append_batch` contract for uncertain result suffixes.

## Ownership And Reads

Both modes use an exclusive OS lock on a stable `.lock` sidecar, including across independently opened factories.
The sidecar is never replaced or removed, so ownership survives replacement of the journal inode.
Components, their clones, all derived reads, and pending blocking workers retain the same opening; even unpolled or completed streams must be dropped before reopening.
Handles contain private canonical-document provenance but retain no writer ownership.
After reopening, compatible handles can be revalidated against membership; foreign-document handles are rejected even for equal identities.
Do not rename, replace, or externally modify files in an active namespace.
Stop all old writers before upgrading: older binaries lock the journal itself and do not participate in sidecar locking.
Journal record encoding is unchanged, but mixed-version writers are unsupported.

Reads initialize lazily, retain complete bounded/live history, and register wakeups under the published-state lock.
Journal mutations serialize separately, preserving content/event/snapshot dependency order.
Event encoding, writes, and synchronization do not hold the published-state lock: heads, resolutions, and stream polls can observe the previously published prefix while a batch is pending.
The brief in-memory batch publication still holds that lock.
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
Worker panics and join failures also produce ambiguous results and poison the opening; panic handling wakes readers even when the caller has already cancelled.
The poisoned journal mutex independently prevents observations during panic unwinding, before explicit failure notification.
This prevents reporting a false reconciliation bound from stale in-memory state.

## Limits

The complete journal is recovered into memory, history is never pruned, and namespace allocation searches for an unused numeric filename.
Namespace opening, document creation/recovery, blob/directory writes, and snapshot appends still perform synchronous I/O and can block the calling executor.
Blob/directory writes and snapshot appends also synchronously wait for the journal writer mutex and hold the state mutex across their own I/O; reads may wait behind those barriers or an in-memory publication, but not event-batch disk I/O.
There is no throughput, distributed locking, remote replication, or production capacity claim.
Durable mutations write only new frames; they do not copy retained history or replace the journal inode.
Event batches allocate encoded bytes proportional to the batch size and amortize one journal synchronization across the batch.
Durable behavior assumes the local filesystem provides durable-prefix integrity, crash-atomic same-directory rename for creation, and truthful file and directory synchronization.
The storage device must honor flushes; media corruption, remote filesystems, and writes through buffered mode are outside the power-loss guarantee.
The supported interrupted-tail model leaves verified complete frames followed by an optional short header or short payload with an intact length/complement pair.
Malformed lengths and complete checksum failures are errors, including at the final frame; checksums cannot distinguish torn unacknowledged bytes from damaged acknowledged history.
Truncation of acknowledged history cannot be distinguished from an interrupted tail without a separate durable commit boundary.
Such loss, or full-length torn frames, is outside the automatic-repair model; this is a stronger filesystem/device requirement than generic append plus fsync.
Tests cover every incomplete next-frame length, complete-frame corruption, single-sync batching, lost acknowledgments, inode reuse, and cross-process locking; actual power-cut qualification remains outstanding.
Current-thread runtime tests cover unrelated task admission and published-prefix reads during blocked batch I/O, cancellation-retained opening ownership, and panic poisoning and reader wakeups with and without cancellation.

See [`src/storage.rs`](src/storage.rs) for components and localized tests, and [`src/journal.rs`](src/journal.rs) for framing and fault boundaries.
Shared view and sparse-archive laws come from [`sea-conformance`](../sea-conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-file --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file --all-features --no-deps
```
