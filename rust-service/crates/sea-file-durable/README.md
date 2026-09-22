# Sea Durable File

`sea-file-durable::storage::DurableStorage` implements `SeaStorage` using the shared filesystem engine's synchronized configuration.
It provides independently usable blob, event, and snapshot components, exclusive OS-locked openings, dependency-closed recovery, and direct monitored live reads.
The engine and format are documented in [sea-file](../sea-file/README.md).
It remains experimental rather than a production storage backend.

**Filesystem requirement:** this backend requires durable-prefix integrity, not just an implementation of fsync.
Appending or truncating an unsynchronized tail must never damage previously synchronized bytes or length, including a shared final sector.
Only filesystems and devices satisfying the interrupted-tail model below are supported; ordinary append plus fsync does not establish that property by itself.

## Ownership and Cancellation

Components, reads, and pending event workers retain the exclusive opening; availability handles do not.
Event batches use one Tokio blocking task per batch and leave the published prefix readable during disk I/O.
Other filesystem operations remain synchronous barriers; see the [shared engine limits](../sea-file/README.md#limits).
Returned results establish settlement, but cancellation does not stop a worker or make a concurrent head authoritative.
After cancellation, drop all components and streams and successfully reopen to establish settlement; `Busy` means an owner remains, not permission to retry.
Uncertain writes, worker panics, and join failures poison authoritative observations until recovery and wake readers even after cancellation.

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
Never automatically retry an uncertain entry; follow the shared `Archive::append_batch` contract.

Reopening holds a stable `.lock` sidecar, truncates any structurally incomplete final frame, synchronizes the selected journal and its directory before exposing records, and discards creation staging files regardless of their contents.
This also makes a recovered but previously unacknowledged publication durable before later callers can depend on it.
Document creation still uses synchronized staging and atomic rename to avoid publishing an incomplete format header.
Malformed length complements and full-length checksum failures remain errors, not permission to drop a final frame.
Checksums cannot identify whether damaged bytes were acknowledged, and the format has no separate persisted commit boundary.
Consequently, truncation of acknowledged history is indistinguishable from an interrupted append, and full-length torn frames cannot be safely repaired.
The assumptions above exclude these cases; arbitrary silent corruption is not tolerated or repaired.

Both file modes share sidecar locking, incompatible with old writers that lock the journal inode.
Stop old binaries before upgrading, never remove active sidecars, and do not switch to buffered writes when relying on durability.

Mutation write volume is proportional to new frames, while recovery still reads the complete retained history into memory.
Batch encoding uses memory proportional to the batch size.
Actual power-cut qualification remains outstanding; deterministic crash tests do not certify filesystems, devices, or arbitrary sector tears.
This includes ZFS: each pool/device/flush configuration needs qualification, and `sync=disabled` is unsupported.

## Validation

From `rust-service/`, run:

```bash
cargo test -p sea-file-durable --all-targets --all-features
cargo clippy -p sea-file-durable --all-targets --all-features -- -D warnings
```

Tests cover conformance, dependency-closed recovery, tail repair, corruption rejection, live reads, and retained ownership.
The shared engine adds fault-injected synchronization/cancellation/panic tests and a separate cross-process locking test.
External journal/lock replacement, distributed filesystems, and media failure are outside the supported model.
