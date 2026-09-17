# Sea Durable File

This crate is a single-process `SeaStorage` implementation with checksummed framing, sync-before-acknowledgement, deterministic crash points, blob-tree references, retained snapshot history, and reopen behavior.
It remains experimental rather than a production storage backend.

From `rust-service/`, run:

```bash
cargo test -p sea-file-durable --all-targets --all-features
cargo clippy -p sea-file-durable --all-targets --all-features -- -D warnings
```

The test suite covers archive conformance, clean reopen behavior, incomplete-tail recovery, and checksum-corruption rejection.

Successful tests demonstrate recovery after process termination while the operating system remains running. They do not demonstrate survival across power loss, filesystem or hardware failure, multi-process writer safety, retention, replication, or remote storage semantics. Persisted-size output is structural evidence for this encoding, not a capacity or throughput claim.
