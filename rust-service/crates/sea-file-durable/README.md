# Sea Durable File

`sea-file-durable::storage::DurableStorage` implements replacement `SeaStorage` using the shared filesystem engine's synchronized configuration.
It provides independently usable blob, event, and snapshot components, exclusive OS-locked openings, dependency-closed recovery, and direct monitored live reads.
The engine and format are documented in [sea-file](../sea-file/README.md).
It remains experimental rather than a production storage backend.

Every successful write synchronizes a complete replacement journal, atomically publishes it, and synchronizes the containing namespace; namespace creation synchronizes its ancestors.
Recovery preserves complete checksummed frames, ignores unpublished staging files, repairs legacy incomplete tails through replacement, and rejects corrupt published history or missing dependencies.
Uncertain writes poison the opening until recovery, rather than claiming an authoritative head from stale state.
Snapshot identities are event positions and there is no backend publication-operation registry.
Handles carry provenance without retaining writer authority; components and reads retain the opening until dropped.

## Power-Loss Model

The design preserves acknowledged records across power loss under these assumptions:

- The local filesystem provides crash-atomic same-directory rename: before directory synchronization, recovery sees either the old name binding or the new one, not a missing or partially replaced binding.
- Successful file synchronization persists content and length; successful directory synchronization persists name bindings.
- Writing a different inode does not damage synchronized data, including the final sector of the previous journal.
- The device honors flushes, and there is no independent media corruption or external namespace modification.

Each mutation writes the old prefix and new frame into a fresh `.pending` inode.
Only after that file is synchronized does rename publish it as the `.sea` journal.
The parent directory is synchronized before success is returned.
Power loss before rename leaves the old journal; power loss after rename but before directory synchronization may leave either complete version.
After directory synchronization, the new version must survive under the assumptions above.
An unacknowledged write can therefore be absent or present; it is never automatically retried.

Reopening holds a stable `.lock` sidecar, synchronizes the selected journal and its directory before exposing records, and discards staging files regardless of their contents.
This also makes a recovered but previously unacknowledged publication durable before later callers can depend on it.
Document creation follows the same sequence, and repair of a legacy incomplete tail also uses replacement rather than in-place truncation.
Checksummed corruption in the published journal remains an error, not permission to drop acknowledged data.

Both file modes share sidecar locking.
Stop old binaries before upgrading; the journal encoding is unchanged but the lock protocol is not compatible with old writers.
Never remove sidecars in an active namespace, and do not switch to buffered writes when relying on power-loss durability.

Each mutation copies the entire journal and needs temporary space for both versions.
For fixed-size records, cumulative write cost is quadratic in retained history; this is a correctness-first implementation, not a throughput claim.
Deterministic tests validate the modeled crash states, but actual power-cut qualification on filesystem and device combinations is still outstanding.
Within this stated model, the remaining power-loss gap is qualification testing, not an intentionally unsupported torn-write recovery case.

## Validation

From `rust-service/`, run:

```bash
cargo test -p sea-file-durable --all-targets --all-features
cargo clippy -p sea-file-durable --all-targets --all-features -- -D warnings
```

Replacement tests cover shared view/snapshot conformance, dependency-preserving reopen, incomplete-tail repair, checksum-corruption rejection, independent factories, live delivery, and stream-retained opening ownership.
The owning shared engine tests pre-write rejection, every staging-prefix truncation, corruption at every staging byte, both rename outcomes before directory synchronization, post-sync lost acknowledgments, snapshot recovery, and wakeups on uncertainty.
Its separate process test verifies that replacement cannot release exclusive ownership or permit a buffered writer to bypass the lock.

Successful tests are not certification of survival across power loss or filesystem/hardware failure.
OS locks exclude competing valid openings; external replacement of journal or lock files and distributed filesystems are outside the supported model.
There is no retention policy, replication, remote storage, capacity, or throughput claim.
