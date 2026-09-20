# Sea Durable File

`sea-file-durable::storage::DurableStorage` implements replacement `SeaStorage` using the shared filesystem engine's synchronized configuration.
It provides independently usable blob, event, and snapshot components, exclusive OS-locked openings, dependency-closed recovery, and direct monitored live reads.
The engine and format are documented in [sea-file](../sea-file/README.md).
It remains experimental rather than a production storage backend.

**Filesystem requirement:** this backend requires durable-prefix integrity, not just an implementation of fsync.
Appending or truncating an unsynchronized tail must never damage previously synchronized bytes or length, including a shared final sector.
Only filesystems and devices satisfying the interrupted-tail model below are supported; ordinary append plus fsync does not establish that property by itself.

Every successful mutation appends new frames and synchronizes the journal, once per event batch.
Document creation synchronizes a temporary journal, renames it, and synchronizes the containing namespace; namespace creation synchronizes its ancestors.
Recovery preserves complete checksummed frames, ignores unpublished creation staging files, truncates structurally incomplete tails, and rejects corrupt frames or missing dependencies.
Uncertain writes poison the opening until recovery, rather than claiming an authoritative head from stale state.
Snapshot identities are event positions and there is no backend publication-operation registry.
Handles carry provenance without retaining writer authority; components, reads, and pending event workers retain the opening.
Event batches run in one Tokio blocking task per batch, without holding the reader state lock during writes or synchronization.
Returned results establish settlement, but cancellation does not stop the worker or make a concurrent head a reconciliation bound.
Drop all components and streams and successfully reopen to establish settlement after cancellation; reopening remains `Busy` until retained workers finish.
Worker panics and join failures poison authoritative observations and wake readers, including after cancellation.
Namespace opening, document creation/recovery, blob/directory writes, and snapshot appends remain synchronous barriers as detailed in the shared engine documentation.

## Power-Loss Model

The design preserves acknowledged records across power loss under these assumptions:

- The local filesystem provides crash-atomic same-directory rename: before directory synchronization, recovery sees either the old name binding or the new one, not a missing or partially replaced binding.
- Successful file synchronization persists content and length; successful directory synchronization persists name bindings.
- Appends and recovery truncation preserve all previously synchronized journal bytes and length, including the final sector shared with new data.
- An interrupted append leaves a prefix of valid complete frames and optionally an incomplete final header or payload with an intact length/complement pair.
- The device honors flushes, and there is no independent media corruption or external namespace modification.

Each mutation writes only its new frames to the existing `.sea` inode.
One journal synchronization settles an event batch; there is no retained-history copy or per-append directory synchronization.
Nothing is published to component readers before synchronization succeeds.
Power loss before acknowledgment can retain any ordered prefix of the unacknowledged batch, including the entire batch.
An uncertain batch therefore returns an `Ambiguous` result for every submitted entry and poisons the opening.
This uncertain suffix follows the shared `Archive::append_batch` contract.
No uncertain entry is automatically retried.

Reopening holds a stable `.lock` sidecar, truncates any structurally incomplete final frame, synchronizes the selected journal and its directory before exposing records, and discards creation staging files regardless of their contents.
This also makes a recovered but previously unacknowledged publication durable before later callers can depend on it.
Document creation still uses synchronized staging and atomic rename to avoid publishing an incomplete format header.
Malformed length complements and full-length checksum failures remain errors, not permission to drop a final frame.
Checksums cannot identify whether damaged bytes were acknowledged, and the format has no separate persisted commit boundary.
Consequently, truncation of acknowledged history is indistinguishable from an interrupted append, and full-length torn frames cannot be safely repaired.
The assumptions above exclude these cases; arbitrary silent corruption is not tolerated or repaired.

Both file modes share sidecar locking.
Stop old binaries before upgrading; the journal encoding is unchanged but the lock protocol is not compatible with old writers.
Never remove sidecars in an active namespace, and do not switch to buffered writes when relying on power-loss durability.

Mutation write volume is proportional to new frames, while recovery still reads the complete retained history into memory.
Batch encoding uses memory proportional to the batch size.
Deterministic tests validate the modeled crash states, but actual power-cut qualification on filesystem and device combinations is still outstanding.
Do not infer support for arbitrary sector tears or filesystem/device combinations from these deterministic tests.
ZFS is not blanket-certified by this implementation or its tests: each filesystem, pool, device, and flush configuration must satisfy the assumptions above and requires power-cut qualification.
ZFS datasets configured with `sync=disabled` are unsupported because they do not honor the required synchronization durability.

## Validation

From `rust-service/`, run:

```bash
cargo test -p sea-file-durable --all-targets --all-features
cargo clippy -p sea-file-durable --all-targets --all-features -- -D warnings
```

Replacement tests cover shared view/snapshot conformance, dependency-preserving reopen, incomplete-tail repair, checksum-corruption rejection, independent factories, live delivery, and stream-retained opening ownership.
The owning shared engine tests pre-write rejection, every incomplete next-frame length, complete-frame corruption, inode reuse without history copying, single-sync batches, pre-sync uncertainty, post-sync lost acknowledgments, snapshot recovery, and wakeups on uncertainty.
It also tests current-thread executor progress and published-prefix reads during blocked I/O, cancellation-retained ownership, and worker-panic poisoning and wakeups after cancellation.
Its separate process test verifies that appends cannot release exclusive ownership or permit a buffered writer to bypass the lock.

Successful tests are not certification of survival across power loss or filesystem/hardware failure.
OS locks exclude competing valid openings; external replacement of journal or lock files and distributed filesystems are outside the supported model.
There is no retention policy, replication, remote storage, capacity, or throughput claim.
