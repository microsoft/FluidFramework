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
Durable mode writes a complete replacement journal, synchronizes it, atomically renames it over the published journal, and synchronizes the parent directory before acknowledgment.
It never appends to the published inode, so an interrupted write cannot tear a sector shared with acknowledged data.
Document creation uses the same publication sequence; namespace creation synchronizes its ancestors.

Recovery verifies framing, content identities, transitive directory closure, a dense event prefix, and strictly advancing snapshot dependencies before exposing components.
Buffered recovery rejects incomplete tails; durable recovery repairs a legacy incomplete final frame by publishing a replacement without that tail.
Complete corrupt frames or missing required dependencies fail recovery rather than producing gaps.
An unpublished `.pending` file is discarded even if it contains valid frames; a full-length corrupt staging file cannot prevent recovery of the published prefix.
Durable reopening synchronizes the selected journal and parent directory before exposing records, completing any publication whose acknowledgment was lost.
Raw event components treat tree identities as opaque, while the view establishes availability before publication; raw writes with absent dependencies therefore make subsequent recovery fail.
Snapshots persist only position/root identities, not handles or session publication metadata.

Blob and directory content is immutable and deduplicated; directory publication checks child availability before modifying the journal.
Events are never deduplicated or retried, and snapshots must advance their event position.
Session retry identities and conditional snapshot policy remain above storage.

## Ownership And Reads

Both modes use an exclusive OS lock on a stable `.lock` sidecar, including across independently opened factories.
The sidecar is never replaced or removed, so ownership survives replacement of the journal inode.
Components, their clones, and all derived reads retain the same opening; even unpolled or completed streams must be dropped before reopening.
Handles contain private canonical-document provenance but retain no writer ownership.
After reopening, compatible handles can be revalidated against membership; foreign-document handles are rejected even for equal identities.
Do not rename, replace, or externally modify files in an active namespace.
Stop all old writers before upgrading: older binaries lock the journal itself and do not participate in sidecar locking.
Journal record encoding is unchanged, but mixed-version writers are unsupported.

Reads initialize lazily, retain complete bounded/live history, and register wakeups under the mutation lock.
Finite ranges have exclusive lower and inclusive upper bounds, including sparse snapshot bounds.
Nonempty ranges reject bounds beyond their initialization head; reversed/equal ranges complete without waiting.
Progress advances only with delivery, reports backlog, and remains coherent when discovering new appends.
Normal commits and uncertain writes wake readers outside the state lock; uncertain openings terminate reads with an error.

## Cancellation And Failures

Filesystem work is synchronous within each async method, with no internal suspension, detached work, or automatic retry.
An unpolled mutation has no effect; once polled it settles before returning.
A rejected input does not append a record.
An I/O error after writing begins is `Ambiguous` and poisons the opening: later writes, heads, resolutions, and lookups fail until all opening owners are dropped and recovery succeeds.
This prevents reporting a false reconciliation bound from stale in-memory state.

## Limits

The complete journal is recovered into memory, history is never pruned, and namespace allocation searches for an unused numeric filename.
Synchronous I/O can block the calling executor; there is no throughput, distributed locking, remote replication, or production capacity claim.
Each durable mutation copies the complete journal and temporarily needs space for both versions; total write cost grows quadratically with retained history for fixed-size records.
This implementation favors a simple recovery argument over throughput and is not suitable for large append-heavy archives.
Durable behavior assumes the local filesystem provides crash-atomic same-directory rename, honors file and directory synchronization, and protects synchronized files from writes to other inodes.
The storage device must honor flushes; media corruption, remote filesystems, and writes through buffered mode are outside the power-loss guarantee.
Tests exercise torn staging images, both pre-directory-sync rename outcomes, post-sync acknowledgment loss, and cross-process locking; actual power-cut qualification remains outstanding.

See [`src/storage.rs`](src/storage.rs) for components and localized tests, and [`src/journal.rs`](src/journal.rs) for framing and fault boundaries.
Shared view and sparse-archive laws come from [`sea-conformance`](../sea-conformance/README.md).

## Validation

From `rust-service/`:

```bash
cargo test -p sea-file --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file --all-features --no-deps
```
