# Counter Example

This bounded in-memory example submits `2`, submits `3`, snapshots the value `5`, submits `-1`, and recovers through `SeaArchive::load`.
The backend creates the document and its exclusive view.
Every snapshot references a committed event, including a snapshot of initial application state.

From `rust-service/`, run:

```bash
cargo run -p sea-counter
cargo test -p sea-counter --all-targets
```

The executable succeeds only after asserting the recovered value and prints:

```text
recovered counter: 4
```

The example demonstrates ordered submissions, blob-backed snapshots, snapshot-plus-tail recovery, and rejection of counter payloads that are not exactly eight bytes.
It does not provide persistence, networking, multi-process coordination, or a performance measurement.