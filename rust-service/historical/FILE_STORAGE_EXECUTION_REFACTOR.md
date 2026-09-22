# File Storage Execution Refactor

Date: 2026-09-22
Worktree: `/workspaces/FluidFramework-directory-dedup`
Branch: `sea-directory-dedup`
Integration base: `5761a2bc481`
Progress checkpoint: `5e9459eadaf`; completion changes remain uncommitted.

## Outcome

The [approved plan](../FILE_STORAGE_REFACTOR_PLAN.md) is implemented with one `sea-file` crate, independent buffered and durable execution owners, common file/recovery mechanisms, and shared component glue in `storage.rs`.
Buffered publication precedes filesystem writes and drains in bounded turns; durable publication retains its synchronization barriers.
Both policies retain accepted work through cancellation, bound mutation capacity, isolate filesystem work, and expose orderly flush/shutdown.
The server uses a generic `SeaStorage` adapter, selecting built-in concrete types only at construction.
The retired durable crate leaves a documentation redirect, not a workspace member or compatibility implementation.
No journal bytes, checkpoint encoding, session IDs, or wire protocol changed.

Buffered success is not production persistence: crash or background failure can lose acknowledged history and dependencies, defeat resubmission, corrupt a journal, or prevent reopening.
Flush completes OS writes without fsync; shutdown additionally fences admission and waits for accepted workers.
Retained components and streams continue to own document locks after shutdown until dropped.
See [Decision 0020](decisions/0020-file-storage-execution.md) and the [backend guide](../crates/sea-file/README.md).

## Contracts And Evidence

| Changed Boundary | Evidence |
| --- | --- |
| `sea-core` persistence/lifecycle | Revised `Durability::Buffered`, factory lifecycle contracts, and shared conformance's explicit flush before orderly reopening. |
| `sea-file` buffered execution | Paused writes permit acknowledged reads and resident directory/snapshot admission; count/byte saturation, cancellation, shutdown wakeups, dependency persistence, exact variable-sized offsets, checkpoint ordering, and reopen tests. |
| `sea-file` durable execution | Existing fault/recovery tests plus cancellation-retained admission and a captured-prefix flush that does not await later submissions. Journal/cursor synchronization precedes visibility. |
| Shared ownership and isolation | Historical reads run lazily on bounded workers; stable wake relay avoids missed notifications; directory deduplication and stable sidecar/cross-process ownership tests retained. |
| Worker fairness | One-worker hot/cold test admits 128 hot jobs and verifies the cold job runs by the first 32-job/1-MiB drain turn. |
| Host and listeners | Injected custom storage covers generic create/session/flush/shutdown; virtual-time listener test rejects successful drain on storage failure or timeout; all-mode native and real browser integration. |
| `sea-benchmarks` | Ordered replay test and three repetitions of the complete payload/window/backend matrix, with final draining included. |

Each factory and its clones share four file workers.
Each opening bounds accepted mutations to 128 requests and 16 MiB of charged data; buffered capacity waiters have another 128-request/16-MiB budget.
Content preparation has a separate bounded staging budget before allocation/metadata waits.
Charges conservatively cover inputs, encoding, framing, and metadata; caller backing allocations, allocator overhead, returned reads, transports, and filesystem caches are not a total-process bound.
Durable saturation rejects before acceptance; buffered saturation waits within its bounded waiting budget.

## Validation

Passed on the implementation worktree:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`
- `cargo build --workspace --all-targets`
- `cargo test --workspace --all-targets --all-features`
- `node scripts/check-documentation.mjs`
- Root `pnpm policy-check --path rust-service` and `pnpm build:fast`
- `./test.sh`, including package tests, generated WASM, SharedTree, Tinylicious comparison, Chromium WebTransport/WebSocket, and physical connection release.

Final file coverage includes 37 unit tests and the isolated cross-process locking test.
The native server's browser-only fixture is intentionally ignored in the ordinary Cargo invocation and exercised by the aggregate harness.
The first aggregate run had 24 passing Mocha cases and one failure because this sibling worktree lacked Tinylicious dependencies.
`pnpm install --frozen-lockfile --offline` in `server/routerlicious` supplied that fixture without lockfile changes; the complete aggregate rerun passed.
This is a resolved environment prerequisite, not a suppressed flaky test.
The earlier healthy buffered queue-saturation benchmark failed with `buffered admission capacity exceeded`; bounded capacity waiting fixed it and both subsequent full matrices passed.

## Measurement Setup

Command: `target/release/storage-pipeline BACKEND BYTES WINDOW NEW_DIRECTORY` after a release build.
Backends: memory, buffered-file, durable-file; payloads: 64/8192 bytes; windows: 1/128.
Each fresh process uses a 128-operation warmup document followed by a fresh 4096-operation measured document.
Three sequential repetitions of every cell passed exact payload, receipt-order, and 4096-delivery checks.
One current-thread Tokio runtime drives the workload; no CPU affinity was imposed.
Creation is outside timing; throughput includes all measured admissions and final flush, but not verification replay or session teardown.
RSS is process-wide peak including warmup and replay, not queue occupancy.

Environment: Rust 1.98.1 (`48a229cea`), Linux `6.8.0-1064-azure`, x86_64, AMD EPYC 7763 virtual machine with 32 reported logical CPUs.
Data resides on `/tmp`, ext4 `/dev/sdb1[/containerTmp]`, `rw,relatime`, separate from the container overlay root.
Other host workloads were not controlled; these short samples are not a capacity qualification.
Measured release binary SHA-256: `077f5092d9732ccdfc37cf11ecf396fdcfe41819d605648bc6d52fe9c01b13f8`.
Benchmark source SHA-256: `81d52979c91596bb19893709218cca1c70271d0013aef3d2a8b35986194f1ad7`.
Raw local rows are `/tmp/sea-refactor-final-v2-BACKEND-BYTES-WINDOW-REPETITION.jsonl`; the medians and ranges below retain the results independently of those temporary files.

## Results

All values are medians across three repetitions; ranges show the minimum and maximum throughput.
Latency is acknowledgment latency in microseconds, not buffered write-completion lag.

| Backend | Bytes | Window | Ops/s | Ops/s Range | p50 us | p95 us | p99 us | Final Drain ms | Peak RSS MiB |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| memory | 64 | 1 | 318358 | 317797-321191 | 2.98 | 5.15 | 6.54 | 0.00015 | 4.90 |
| memory | 64 | 128 | 298860 | 297414-299570 | 455 | 487 | 492 | 0.00023 | 5.14 |
| memory | 8192 | 1 | 114806 | 113102-115701 | 7.69 | 15.56 | 20.48 | 0.00035 | 36.74 |
| memory | 8192 | 128 | 111554 | 108361-113892 | 1167 | 1376 | 1402 | 0.00047 | 37.14 |
| buffered-file | 64 | 1 | 127789 | 126106-133592 | 3.90 | 27.76 | 50.93 | 0.185 | 4.21 |
| buffered-file | 64 | 128 | 118779 | 118741-119696 | 1037 | 1319 | 1356 | 0.191 | 4.34 |
| buffered-file | 8192 | 1 | 51623 | 51591-55161 | 4.95 | 19.79 | 423 | 1.722 | 5.56 |
| buffered-file | 8192 | 128 | 49985 | 47177-53393 | 1773 | 4541 | 4998 | 1.571 | 9.24 |
| durable-file | 64 | 1 | 942 | 929-986 | 967 | 1300 | 2303 | 0.0024 | 4.00 |
| durable-file | 64 | 128 | 45294 | 43929-45617 | 2705 | 3474 | 4825 | 0.0015 | 4.41 |
| durable-file | 8192 | 1 | 885 | 871-886 | 1044 | 1397 | 2428 | 0.0025 | 4.02 |
| durable-file | 8192 | 128 | 19084 | 18336-19837 | 6475 | 7670 | 8564 | 0.0024 | 9.10 |

File replay takes 0.175-0.299 seconds for 4096 records across the median cells, versus 0.0012-0.0044 seconds in memory.
The file path dispatches each lazy source poll to a worker without prefetch; executor isolation has a visible read-dispatch cost.
Final factory shutdown after explicit drain and session closure is microsecond-scale in these healthy runs; this does not bound syscall latency under faults.

The initial single 64-byte/window-128 observations were 165427 ops/s buffered and 46794 ops/s durable.
The final medians are approximately 28% lower buffered and 3% lower durable.
The initial buffered path acknowledged completed writes; the new path acknowledges bounded in-memory publication but includes the final drain in throughput.
These are not repeated matched baselines, so neither difference establishes a precise causal effect.
The earlier completion campaign also passed all 36 cells, with buffered 64-byte/window-1 at 163992 ops/s before the final settlement handoff change; the final 127789 result reinforces the need to retain variability rather than select the faster run.
No blanket throughput improvement is claimed.

Separate traced 64-byte/window-128 runs before the final worker-reference handoff adjustment observed zero `fsync` calls for buffered and 276 for durable, including startup, warmup, cursors, checkpoints, and shutdown.
They observed 4581/4561 `write`, 42253/42253 `read`, and 97/91 `rename` calls respectively.
Both traced runs passed replay; their timing is excluded from the throughput table.
Different batching makes this a whole-backend comparison, not an isolated fsync-cost experiment.

## Remaining Limits

Portable blocking execution is retained; no evidence here justifies adding Compio/io_uring or deliberate durable batching delay.
The chosen capacities are conservative safety defaults, not performance-optimal limits.
This campaign does not provide per-operation queue lag, peak queue occupancy, phase-level lock/encoding/sync attribution, or sustained multi-document capacity measurements.
Boundedness, checkpoint/history independence, and hot/cold fairness are protected by deterministic tests rather than inferred from RSS or short throughput runs.
Those additional profiles remain optimization work, not unresolved acknowledgment, ownership, or drain semantics.
The existing unexplained native connection and Chromium timeout investigations remain open; successful reruns do not establish their causes.
Filesystem/device power-cut qualification, arbitrary sector tears, media corruption, and production reliability remain outside the validated scope.