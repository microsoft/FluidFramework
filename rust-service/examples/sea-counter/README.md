# Counter Example

This bounded in-memory example appends `2`, appends `3`, publishes a snapshot at `5`, appends `-1`, and recovers the value through the public client and stream traits.

From `rust-service/`, run:

```bash
cargo run -p snapshotted-stream-counter
cargo test -p snapshotted-stream-counter --all-targets
```

The executable succeeds only after asserting the recovered value and prints:

```text
recovered counter: 4
```

The example demonstrates snapshot-based recovery over the in-process memory stream. It does not provide persistence, networking, multi-process coordination, or a performance measurement.