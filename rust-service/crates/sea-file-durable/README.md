# Sea Durable File

`sea-file-durable::storage::DurableStorage` implements replacement `SeaStorage` using the shared filesystem engine's synchronized configuration.
It provides independently usable blob, event, and snapshot components, exclusive OS-locked openings, dependency-closed recovery, and direct monitored live reads.
The engine and format are documented in [sea-file](../sea-file/README.md).
It remains experimental rather than a production storage backend.

Every successful write synchronizes the journal; document allocation synchronizes the containing namespace, and namespace creation synchronizes its ancestors.
Recovery preserves complete checksummed frames, discards an incomplete final frame, and rejects corrupt required history or missing dependencies.
Uncertain writes poison the opening until recovery, rather than claiming an authoritative head from stale state.
Snapshot identities are event positions and there is no backend publication-operation registry.
Handles carry provenance without retaining writer authority; components and reads retain the opening until dropped.

## Validation

From `rust-service/`, run:

```bash
cargo test -p sea-file-durable --all-targets --all-features
cargo clippy -p sea-file-durable --all-targets --all-features -- -D warnings
```

Replacement tests cover shared view/snapshot conformance, dependency-preserving reopen, incomplete-tail repair, checksum-corruption rejection, independent factories, live delivery, and stream-retained opening ownership.
The owning shared engine tests pre-write rejection, partial writes, post-sync lost acknowledgments, snapshot recovery, and wakeups on uncertainty.

Successful tests are not certification of survival across power loss or filesystem/hardware failure.
OS locks exclude competing valid openings; external replacement of locked files and distributed filesystems are outside the supported model.
There is no retention policy, replication, remote storage, capacity, or throughput claim.
