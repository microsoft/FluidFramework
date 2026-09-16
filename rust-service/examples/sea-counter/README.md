# Counter Example

This bounded in-memory example submits `2`, submits `3`, publishes a snapshot at `5`, submits `-1`, and recovers the value through `SeaSession::load`.

From `rust-service/`, run:

```bash
cargo run -p sea-counter
cargo test -p sea-counter --all-targets
```

The executable succeeds only after asserting the recovered value and prints:

```text
recovered counter: 4
```

The example demonstrates stable submissions, blob-backed snapshots, and snapshot-plus-tail recovery over a local sequenced memory session.
It does not provide persistence, networking, multi-process coordination, or a performance measurement.