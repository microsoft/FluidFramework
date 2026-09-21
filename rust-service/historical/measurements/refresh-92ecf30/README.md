# Presentation Refresh at 92ecf30f4a7

The [project overview](../../PROJECT_OVERVIEW.md) interprets these measurements.
Collection used `92ecf30f4a7d17db882cc39e7c60d8d19c1042ba` on 2026-09-20 UTC, after the session-prefix and storage-pipeline changes.
Service source and optimized binaries stayed unchanged throughout collection.
The only harness repair removed the obsolete operation-ID argument from the Node/WASM `submit` call.
The tracked patch and script hashes record that repair; no service optimization was made for these runs.

## Retained Files

- [summary.json](summary.json): reconciled campaign metadata, matrices, artifact hashes, individual sample metrics, statistical summaries, backlog-quarter means, all six complete browser results, validation-log hashes, and the analysis source.
- [browser/run.json](browser/run.json): exact optimized browser invocation and environment.
- [raw-evidence.tar.gz](raw-evidence.tar.gz): 1,182 raw files, including original results, resource/backlog curves, service logs, runner logs, manifests, matrices, wrapper records, tracked patches, and nine validation logs.

The archive is 17,430,210 bytes; SHA-256: `4cce372c58cad7485ef85f83de9597ff323e1cbcf78d60584710caf664f4c49a`.
Every member was extracted and checked against its original SHA-256 before the loose original was removed.
Retained JSON formatting was checked for semantic equality.
Source-count outputs are not retained: use the report's revision, method, and regeneration command.

Inspect with `tar -tzf raw-evidence.tar.gz`; extract with `tar -xzf raw-evidence.tar.gz -C /path/to/scratch`.
Member paths are relative to this directory.
Recorded absolute output paths describe collection locations, not required extraction locations.
The embedded analyzer expects that layout at its `root` constant; change only that scratch root when reproducing analysis.
Its temporary validation-log input is also archived under `validation/`.
The browser wrapper remains unpacked and the browser result files are also embedded in the summary.

## Campaigns

| Archived path | Outcome |
| --- | --- |
| `browser` | Six optimized paths, ten samples each, 100 warmup and 1,000 measured edits; all 60 passed convergence |
| `repeat` | Original refresh attempt: 60 Sea failures caused by the stale harness API and 20 passing Tinylicious samples; excluded from corrected comparisons |
| `submit-smoke` | Corrected Node/WASM API call: 32 documents, 500 ops/s, one-second warmup and three-second measurement; passed with zero errors/missing deliveries |
| `repeat-corrected` | Entire alternating 80-cell matrix rerun; all passed; 16:48:59-17:07:53 UTC |
| `native-repeat` | Ten samples each at six native transport points and four Tinylicious points; all 100 passed; 17:08:33-17:32:55 UTC |
| `storage-1`, `storage-4`, `storage-8` | 48 probes at historical passing/failing storage and core points |
| `refine-1`, `refine-4`, `refine-8` | 43 higher/lower-load probes and retries of inconsistent durable points |
| `final-1`, `final-4`, `final-8` | Twelve final midpoint attempts |
| `buffered-midpoint-corrected` | Valid 4,252 ops/s native buffered-file midpoint; passed |

The 104 storage attempts comprise 57 automatic threshold passes, 42 completed threshold failures, and five pre-measurement failures.
Two pre-measurement failures used invalid 4,250 ops/s native configurations: each of four workers requires an integer rate.
The corrected rate is 4,252, not a silently substituted successful retry at 4,250.
The other three startup failures are durable-file at 120 large ops/s; their cause remains unresolved.
Completed durable runs also include resets and inconsistent low-rate latency failures, all preserved.
Do not pool different revisions, invalid attempts, exploratory probes, or repeated campaigns into one distribution.

All campaign matrices, raw results, and aggregate entries were reconciled.
The retained evidence preserves all 365 stress attempts, including the smoke through its raw archive entry; the 60 browser samples are separate.
The report's current repeated medians and all 24 storage passing/failing rate pairs were checked against the summary.
An exit code of zero for a collector means collection completed, not that every workload passed.

## Conditions and Limits

Native Rust and WASM were rebuilt in release mode; WASM enables SIMD and browser bundles are production-minified.
The server includes `websocket-stream`; no custom LTO or profile tuning was added.
The host is the same AMD EPYC 7763 Codespace, with 32 logical CPUs and 16 exposed physical cores, unlimited inspected cgroups, and workspace ext4 on `/dev/loop4`.
Shared editor and host activity remain uncontrolled.
Storage data stayed on that workspace filesystem; `/tmp` was used only for validation, disposable analysis, and archive verification.

Stress workloads retain the original 32 documents, writer/observer pair per document, 64-byte or 8,192-byte payload, three-second warmup, and ten-second measurement.
Four generators use separate physical CPUs 16,18,20,22.
Service CPU sets are 2; 2,4,6,8; or 0,2,4,6,8,10,12,14.
The browser benchmark shares its original eight-core affinity between browser and service.
No other collection campaign or build ran concurrently.

Passing requires at least 98% in-window submission and observer delivery, per-worker p95 latency and scheduling lag at most 100 ms, and zero final errors or missing deliveries.
It does not test backlog trend or indefinite stability.
Latency includes drain deliveries; worker p95 values are not pooled.
Generator CPU includes warmup and drain; service CPU/RSS cover the measured window.
Payload bandwidth excludes echoes, envelopes, TLS, and wire overhead.
RSS guard termination is not a processing-capacity limit.

Current durable-file synchronizes newly appended frames once per event batch, unlike the old replacement-journal implementation.
Its synchronized-prefix integrity and interrupted-tail assumptions require filesystem/device qualification; these runs do not establish power-loss survival.
Buffered-file does not synchronize each append, and Tinylicious's operation database is in memory with filesystem Git summaries.
These storage modes have different acknowledgment guarantees.
Native WebTransport uses QUIC/TLS; WebSocket and Socket.IO are unencrypted loopback paths.

## Validation and Cleanup

The archived `validation/` logs record passing commands run before measurement:

```bash
cd rust-service
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
cargo build --release --locked -p sea-webtransport-server --features websocket-stream -p sea-benchmarks --bins
node scripts/check-documentation.mjs
cd ..
pnpm build:fast
pnpm policy-check --path rust-service
```

The corrected harness additionally passed its bounded delivery smoke and `pnpm exec biome check rust-service/scripts/presentation-stress.mjs`.
The full non-Rust `./test.sh` was not rerun for this recollection.
The historical Clippy failure in the older report does not apply to this revision.

Disposable Sea journals and Tinylicious summary stores were removed after each completed storage batch, bounding disk use without changing the measurement filesystem.
Final consolidation removed 81 remaining runtime directories with adjacent results, verifying all non-runtime file hashes before and after deletion.
No benchmark services were running during final consolidation.
The archive retains every non-runtime artifact; no source-count archive, database, or journal is needed to analyze these samples.