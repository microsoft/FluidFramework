# Sea File

`sea-file::buffered::FileStorage` and `sea-file::durable::DurableStorage` implement `sea_core::storage::SeaStorage`.
Both factories are also re-exported from the crate root.
`FileStorage::open(root)` or `DurableStorage::open(root)` synchronously creates or opens a namespace; `create_view` allocates a document and `open_view` exclusively recovers one.
The `common` module shares framing, atomic publication, recovery mechanisms, and bounded blocking dispatch.
The `buffered` and `durable` modules own independent admission and execution policies; shared components retain document identity and published state.
The former `sea-file-durable` crate and const-generic factory have been retired without changing journal bytes.

Private `RecordArchive<RecordType>` access shares framing and pending-record reads through the `Record` trait.
Ordinal access and frame-stride arithmetic require `RecordType: FixedSize`; snapshot records implement that capability, while variable-width event records use length and predecessor information.
Binary search remains snapshot-specific because publication guarantees that snapshot event positions increase.
Typed event and snapshot cursors own selection and advancement, leaving the shared stream responsible for bounds, progress, wakeups, and completion without knowledge of record layout.

**Buffered mode is for tests, demonstrations, and comparisons, not production persistence.**
Success acknowledges bounded process-local admission before OS writes.
A crash, forced shutdown, or background disk error can lose acknowledged events, blobs, directories, and snapshots, leave corrupt or incomplete journals, or prevent reopening.
Clients may already have discarded resubmission state; neither resubmission nor snapshot recovery is guaranteed to repair that loss.
Use `SeaStorage::flush` for completed OS writes and `SeaStorage::shutdown` for orderly admission-stop and drain before stopping the runtime.
Neither operation synchronizes buffered files or promises power-loss safety.

## Persistence Model

Each document has an event journal, a fixed-width snapshot journal, a hash-addressed content directory, and independent internal checkpoint state.
Frames contain a length, its complement, a BLAKE3 content hash, and the record bytes.
Journal helpers own checked frame-boundary arithmetic and prefix probing; matching event identities still require full checksum and record validation.
Buffered reservation and durable append share one event encoder, and admission overhead is derived from that layout.
Event positions are literal byte offsets in the event journal; predecessor offsets support backward traversal for arbitrary range bounds.
Snapshot positions remain event positions; their physical offsets and lookup belong only to storage.
The current experimental formats have no supported migration from earlier versions.
Buffered writes publish pending records and final byte offsets at admission, with `Durability::Buffered`.
Readers span the written prefix and bounded pending suffix; draining never renumbers an acknowledged position.
Durable mode appends to the journal and synchronizes it before acknowledgment, once per event batch.
Durable creation synchronizes a temporary file, renames it, and synchronizes the namespace and newly created ancestors.
On Unix, namespace synchronization stops when the parent belongs to a different filesystem; synchronizing an unrelated parent filesystem cannot persist the namespace's entries.
Mount configuration must already be stable and is outside this guarantee.
The [power-loss model](#power-loss-model) requires durable-prefix integrity, crash-atomic rename, and truthful synchronization; filesystem/device qualification remains outstanding.

Each journal has a checksummed 48-byte `.cursor` containing its validated byte boundary and last record offset.
Opening validates the named tail records and recovers only the suffix after that boundary.
Content is retrieved directly by typed hash; event lookups seek to their byte offsets, and bounded snapshot lookup uses binary search over fixed-width records.
Latest snapshot lookup reads one frame, and snapshot streams advance a private physical cursor after initial bound selection.
There is no historical address table to load or rewrite.
The previously validated prefix is trusted under the durable-prefix integrity model; independent media corruption is outside that model and may be detected only by an affected read.
Buffered recovery rejects incomplete tails; durable recovery truncates an incomplete final frame and synchronizes the repaired journal.
Complete corrupt suffix frames or missing required dependencies fail recovery rather than producing gaps.
An unpublished creation `.pending` file is discarded even if it contains valid frames.
Durable reopening synchronizes the selected journal and parent directory before exposing records, including complete frames whose acknowledgment was lost.
This settlement happens once after tail recovery; creation uses its atomic-publication barriers instead.
An unchanged validated cursor is reused, while a missing or advanced cursor is atomically published.
Each journal rejects record types belonging to another storage surface.
Raw event components treat tree identities as opaque, while the view establishes availability before publication; raw writes with absent dependencies therefore make subsequent recovery fail.
Snapshots persist only position/root identities, not handles or session publication metadata.

Internal checkpoint metadata is separate from the application snapshot archive and does not create an application snapshot.
Publication writes the opaque payload plus a 32-byte checksum to `.checkpoint.pending`, synchronizes it in durable mode, atomically renames it over `.checkpoint`, and synchronizes the directory before acknowledgment.
An unpublished replacement is ignored by recovery; atomic rename selects the complete old or new value.
Checkpoint publication neither reads nor rewrites content, journals, or storage cursors.
Any uncertain publication poisons the opening.
Storage independently publishes its fixed-size cursor after each successful event batch or snapshot append, after settling the journal.
In durable mode this adds a cursor-file synchronization and directory synchronization per batch, independent of history size.
Mutation admission is bounded as described below; oversized mutations are rejected before publication.
The sequencer bounds its event batches and independently checkpoints its applied state.

Blob and directory content is immutable and deduplicated; directory publication checks child availability before publishing its hash-addressed file.
Directory membership proves transitive availability because publication and recovery establish closure and content is never removed.
Reusing a stored directory checks membership without taking the journal writer lock or checking its children again.
Membership checks the hash-addressed filename; writer independence does not imply an I/O-free lookup.
New directories are encoded once for identity and persistence; durable publication rechecks membership within document mutation order.
The document opening owns content and checkpoint publication failures independently of the event and snapshot journals.
Events are never deduplicated or retried, and snapshots must advance their event position.
Session retry identities and conditional snapshot policy remain above storage.

Buffered event batches become visible together at admission; durable batches become visible only after journal and cursor synchronization.
Empty batches perform no I/O; pre-write rejection attempts no entries.
An uncertain durable batch returns `Ambiguous` for every submitted entry because recovery may retain any prefix, including all entries.
Buffered background failure cannot retract returned successes; it poisons observations, admission, flush, and shutdown.
Process the entire error suffix, not just its first error, and never automatically retry it.

## Ownership And Reads

Event archives support independent terminal-opening observation through `Archive::observe_invalidation`.
Opening poison reports the classified ambiguous error, and factory shutdown reports a rejected closed-opening error.
Notification is sticky, covers racing and late registrations, and runs without another archive poll.
The observer source releases its own lock before invoking callbacks; observers must not reenter storage.
Dropping a registration removes it synchronously.
Ordinary storage-backed read behavior is unchanged.

Both modes use an exclusive OS lock on a stable `.lock` sidecar, including across independently opened factories.
The sidecar is never replaced or removed, so ownership survives replacement of the journal inode.
Components, their clones, all derived reads, and pending blocking workers retain the same opening; even unpolled or completed streams must be dropped before reopening.
Handles contain private canonical-document provenance but retain no writer ownership.
After reopening, compatible handles can be revalidated against membership; foreign-document handles are rejected even for equal identities.
Do not rename, replace, or externally modify files in an active namespace.
Stop all old writers before upgrading: older binaries lock the journal itself and do not participate in sidecar locking.
The byte-offset journal format is incompatible with earlier experimental layouts; mixed-version writers are unsupported.

Reads initialize lazily and register wakeups under the published-state lock.
Mutations serialize separately in dependency order; event-batch disk I/O leaves the previously published prefix readable.
In-memory publication briefly holds the state lock.
Finite ranges have exclusive lower and inclusive upper bounds, including sparse snapshot bounds.
Nonempty ranges reject bounds beyond their initialization head; reversed/equal ranges complete without waiting.
Progress advances only with delivery, reports backlog, and remains coherent when discovering new appends.
Normal commits and uncertain writes wake readers outside the state lock; uncertain openings terminate reads with an error.

## Cancellation And Failures

Async operations require an active Tokio runtime.
Buffered workers coalesce consecutive event jobs without a timer and drain finite turns; idle documents own no worker task.
Durable requests preserve FIFO admission through cancellation, acquiring document order before factory worker capacity.
The worker owns the inputs and retains the opening until work finishes; dropping the caller future does not stop an admitted worker or release its exclusive OS lock.
An unpolled mutation has no effect, and an empty batch starts no worker.
Returned batch results establish logical publication: a subsequent successful head bounds every returned result, including errors.
Durable success also establishes synchronized persistence; buffered write completion is established separately by flush.
Cancellation alone does not establish settlement, and a concurrent head may precede later publication by the cancelled worker.
Factory flush waits for accepted work; shutdown stops admission and drains it, including work whose callers were cancelled.
For buffered admission, cancellation while waiting for capacity has no storage effect; acceptance atomically publishes state and transfers ownership to the queue.
For durable admission, reservation of bounded request/byte capacity transfers ownership to an independently retained ordered task.
Reopening returns `Busy` while a retained worker still owns the opening; this is not permission to retry the append.
A rejected input does not append a record.
An I/O error after writing begins is `Ambiguous` and poisons the opening: later writes, heads, resolutions, and lookups fail until all opening owners are dropped and recovery succeeds.
Worker panics and join failures also poison the opening and wake readers, even after caller cancellation.
Poisoning blocks authoritative observations during unwinding, before explicit failure notification.

## Limits

Only the suffix after the storage cursor is recovered into memory; history is never pruned, and namespace allocation searches for an unused numeric filename.
Publication write volume does not grow with retained history.
A bounded snapshot lookup takes logarithmic frame reads, and streaming the full snapshot history takes linear frame reads with constant cursor space.
A non-record event bound can traverse event history backward; latest lookups and event reads from returned positions need no such traversal.
Content uses one file per typed hash, so filesystem metadata costs remain workload-dependent.
Only synchronous factory construction requires caller-provided execution isolation.
Creation/recovery, mutations, checkpoints, metadata checks, and lazy historical reads use bounded blocking workers, including for direct storage callers.
Each durable factory and its clones share a default budget of 32 concurrent filesystem operations; buffered factories default to four.
Use `DurableStorage::open_with_worker_limit(root, limit)` or `FileStorage::open_with_worker_limit(root, limit)` to select a different positive budget.
Zero and limits above Tokio's semaphore capacity are rejected before creating the namespace.
Independently constructed factories have independent budgets, and the Tokio runtime's blocking-thread limit can further restrict concurrency.
This is an I/O concurrency limit, not a CPU allocation or a preallocated thread pool: durable workers remain occupied during filesystem synchronization.
Tune it for the document count, device, and latency target; 32 is a starting default, not a measured universal optimum.
Reads and mutations share the budget; FIFO worker admission and document ordering allow queued work to make progress, but do not promise a latency bound during slow syscalls.
Document mutation order is acquired before worker capacity, so a document's queued mutations do not hold worker permits while awaiting earlier mutations.
Each document bounds accepted mutations to 128 requests and 16 MiB of conservatively charged input, encoding, framing, and metadata space, including in-flight work.
Content preparation has a separate 128-request/16-MiB budget acquired before encoding or metadata waits; worker-owned validation retains its charge after caller cancellation.
Buffered callers wait FIFO for queue capacity, with a separate limit of 128 waiting calls and 16 MiB of charged waiting inputs; excess waiters and oversized requests are rejected.
Durable saturation rejects before acceptance; bounded accepted tasks retain their budgets through cancellation and settlement.
Caller-owned buffers, transport queues, read results, allocator overhead, and filesystem caches are not a total-process memory guarantee.
Drain turns stop after bounded work or a 1 MiB batching target; a single admitted request can exceed that target but not its admission budget.
Disk work does not hold the published-state mutex. Durable content visibility uses a separate publication fence.
Checkpoints participate in mutation order and await their own write, including buffered checkpoints; they do not rebuild journals or historical indexes.
Shutdown timeout can stop waiting, but cannot cancel a syscall or report successful flushing.
Successful shutdown waits for accepted workers to settle; separately retained components and streams still own their document locks until dropped.
Mutations write only new frames without replacing the journal inode; encoding memory is proportional to batch size.
Distributed filesystems, external file replacement, and writes through buffered mode are outside the durable guarantee.
Malformed lengths and complete checksum failures are errors, including at the final frame.
Checksums cannot distinguish a torn unacknowledged record from damaged acknowledged history; only structurally incomplete tails are repairable under the durable model.

See [`src/storage.rs`](src/storage.rs) for components and localized tests, and [`src/journal.rs`](src/journal.rs) for framing and fault boundaries.
Shared view and sparse-archive laws come from [`sea-conformance`](../sea-conformance/README.md).

## Power-Loss Model

Durable mode preserves acknowledged records across power loss under these assumptions:

- The local filesystem provides crash-atomic same-directory rename: before directory synchronization, recovery sees either the old name binding or the new one, not a missing or partially replaced binding.
- Successful file synchronization persists content and length; successful directory synchronization persists name bindings.
- Appends and recovery truncation preserve all previously synchronized journal bytes and length, including the final sector shared with new data.
- An interrupted append leaves a prefix of valid complete frames and optionally an incomplete final header or payload with an intact length/complement pair.
- The device honors flushes, and there is no independent media corruption or external namespace modification.

Ordinary append plus fsync does not establish durable-prefix integrity by itself.
Event and snapshot mutations append to their existing journal inodes; immutable content uses same-directory atomic publication.
Readers observe a durable event batch only after both journal synchronization and fixed-cursor publication complete.
Power loss before acknowledgment can retain any ordered prefix of the unacknowledged batch, including the entire batch.
Never automatically retry an uncertain entry.

Reopening holds a stable sidecar, truncates structurally incomplete suffix frames, synchronizes the selected journals and directories, and discards unpublished creation files.
This makes a complete recovered but unacknowledged publication durable before another caller can depend on it.
Malformed length complements and complete checksum failures remain errors, not permission to discard records.
Checksums cannot distinguish acknowledged truncation from an interrupted append or safely repair a full-length torn frame; the assumptions exclude those cases.
The settled prefix is trusted, so reopening is not a full media-integrity scrub.
External replacement, distributed filesystems, media failure, and buffered writes are outside this model.
Actual power-cut qualification remains outstanding, including each ZFS pool/device/flush configuration; `sync=disabled` is unsupported.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-file --all-features
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file --all-features --no-deps
```

Tests cover framing/corruption, batch visibility and uncertainty, lost acknowledgments, cross-process locks, executor progress during event I/O, and cancellation/panic ownership.
Policy tests cover bounded count/byte backpressure, cancelled waiters, durable prefix flush, shutdown wakeups, and hot/cold-document fairness.
Paused-worker tests verify resident directory/snapshot admission, variable-sized offset reservation, checkpoint ordering, and orderly reopen.
Atomic-file tests cover every truncated unpublished replacement and complete old/new selection.
Storage tests cover checkpoint size and historical-file independence, lazy historical corruption detection, byte-offset bounds, and snapshot lookup without sequencer state.
Read-count regressions cover snapshot lookup and streaming complexity; recovery tests cover journal-type rejection, unchanged cursor reuse, and document-owned checkpoint failures.
Layout tests check both snapshot root variants, invalid widths, and checked ordinal arithmetic; sparse-range reads check cursor initialization independently of public event positions.
Seek-instrumented journal recovery never reads bytes before its storage cursor boundary.
Directory tests cover writer-independent deduplication of recent and reopened content, missing-child rejection, failure-state checks, and recovery of nested content.
