# Presentation Measurement Evidence: 2026-09-20

Use the [project overview](../../PROJECT_OVERVIEW.md) for interpretation and scope.
This directory retains successful measurements, unsuccessful attempts, and superseded configurations.
Do not pool them into a single benchmark distribution.
All timestamps are UTC.

All 80 repeated samples completed before the host reboot and passed the automatic criteria.
Their raw results were reconciled against the predeclared matrix after recovery.
The [repeated summary](repeated-summary.json) retains all eight groups, ten samples each, with medians, ranges, nearest-rank p95, and sample standard deviations.
Backlog inspection and interpretation are recorded in the presentation report.

## Evidence Index

The presentation report records refreshed source counts, their Git revision, and the regeneration command.
New source-count outputs are disposable and are not retained here; historical source inventories below remain part of the original collection.

| Directory | Disposition |
| --- | --- |
| `build-client` | Initial client build and setup evidence |
| `client-smoke` | Initial correctness smoke; browser bundles not yet production-minified |
| `client-baseline` | Ten-repetition unminified baseline; superseded by `optimized-client-baseline` |
| `optimized-smoke` | Correctness smoke after production browser bundling change |
| `optimized-build-gate` | Failed repository gate caused by new measurement JSON formatting; not a runtime failure |
| `optimized-build-gate-retry` | Failed retry caused by the wrapper's in-progress metadata being checked before formatting |
| `optimized-client-baseline` | Accepted optimized browser baseline: six paths, ten samples per path |
| `source` | Superseded inventory: default duplicate-file suppression omitted a maintained Tinylicious source path |
| `source-complete` | Accepted inventory with `--skip-uniqueness`, explicit file lists, and per-file counts |
| `stress-coarse` | 48 exploratory cells; one-second warmup, five-second measurement; includes early overload failures |
| `stress-refinement` | 16 exploratory cells; three-second warmup, ten-second measurement; matrix retained separately |
| `stress-repeated` | Complete predeclared 80-cell campaign, ten repeats per point; three-second warmup, ten-second measurement; finished at 02:28:20 UTC before the host reboot |
| `source-breakdown` | Expanded comment and test/support inventory; syntax-derived Rust test spans and file classifications retained; original source totals unchanged |
| `native-smoke-websocket`, `native-smoke-webtransport` | Correctness smoke for the release native generator and both transports |
| `followup-explore` | 36 single-sample boundary probes; eight Tinylicious 750/1,250 ops/s cells failed worker rate validation before load generation and are invalid performance samples |
| `tiny-fractional-rate-check` | Focused 750 ops/s regression check after allowing fractional per-worker pacing; passed |
| `followup-tiny-retry` | All eight previously invalid Tinylicious configurations rerun; 750 ops/s passed all four configurations, while 1,250 ops/s exceeded the latency threshold |
| `followup-repeat` | Complete predeclared 100-sample native transport and Tinylicious campaign; all passed; raw cells reconciled against manifest and aggregate; 06:04:44-06:29:09 UTC |
| `durable-native-smoke` | Native WebSocket durable-file selection verified at 1,000 ops/s; overload with growing backlog, multi-second latency, connection resets, and missing deliveries retained |
| `native-storage-fine` | Completed 48-cell native WebSocket memory/durable-file and Tinylicious finer-step exploration; 06:42:57-06:55:00 UTC; includes failed loads |
| `native-storage-midpoints` | Completed 14 targeted midpoint and low-durable-rate probes; invoked directly through collector, so manifest/raw results retained without a separate wrapper run.json |
| `buffered-eight-smoke` | Buffered-file selection and eight-core affinity smoke; release native WebSocket, 1,000 large operations/s; passed |
| `buffered-eight` | Completed 48-attempt buffered-file and eight-core exploration; includes one durable-file worker startup failure, not a throughput sample |
| `buffered-eight-midpoints` | Completed 12 refinement attempts, including the durable-file 800 ops/s retry |
| `buffered-eight-final` | Completed three final midpoint probes; memory at 76,000 small ops/s, buffered-file at 62,000 small ops/s, and buffered-file at 19,000 large ops/s |

The [native storage summary](native-storage-summary.json) reconciles all 62 new exploratory cells and preserves per-worker backlog-quarter means.
The matrices are retained as [fine steps](native-storage-fine-matrix.json) and [midpoints](native-storage-midpoints-matrix.json).
These are single samples per point, not replacements for the ten-repeat campaigns or exact capacity estimates.
Storage-sweep validation is retained in `storage-final-{fmt,rustdoc,build,test}.log` (passed) and `storage-final-clippy.log` (the existing server entrypoint length failure).
Documentation, report links, scoped policy, and benchmark process cleanup also passed.

The buffered-file/eight-core campaigns at `354fc17264f157897ef4ff674569de2af51adf44` retain [48 initial results](buffered-eight/cells/results.json), [12 midpoint results](buffered-eight-midpoints/cells/results.json), and [three final results](buffered-eight-final/cells/results.json).
Their matrices are retained as [initial loads](buffered-eight-matrix.json), [midpoints](buffered-eight-midpoints-matrix.json), and [final refinements](buffered-eight-final-matrix.json).
Each matrix matches its manifest, all 63 raw cell results match the corresponding aggregate entries, and every measured cell records the expected service affinity and four generator cores.
There are 36 automatic threshold passes, 26 threshold failures, and one worker startup failure; the startup failure is retained separately from the completed retry at the same durable-file 800 ops/s configuration.
These campaigns were invoked directly through the collector and have no separate wrapper `run.json`.
The optimized native server and generator hashes match across all five storage campaigns and the retained binaries on disk.
No campaign log contains `ENOSPC` or "no space left"; the campaigns completed before cleanup.

The presentation report's expanded storage/core table was checked against the retained results for all 48 passing/failing rate entries.
Backlog-quarter means, per-worker p95, scheduling lag, errors, CPU, and peak RSS were inspected to distinguish threshold passes from stable queues and service capacity.
In particular, eight-core memory at 76,000 small ops/s passed thresholds but accumulated late-window backlog; 80,000 hit the bounded-backlog guard.
Buffered-file at 62,000 small ops/s failed latency with transient queues, while memory and buffered-file at 20,000 large ops/s crossed the service RSS guard.
Durable-file at 700 small ops/s had resets and missing deliveries, not a demonstrated latency or CPU ceiling.
These are exploratory observations, not ten-repeat capacity estimates.

The [follow-up summary](followup-summary.json) retains all ten follow-up groups and individual samples, including generator CPU and measured-window backlog-quarter means.
The report distinguishes paired transport loads from higher WebSocket points and preserves the original Node/WASM measurements separately.

The browser baseline and source inventory have different measurement revisions because the connection-limit override and measurement scripts were added later.
The service data path did not change between these collections.
Performance-related changes are listed with their commits in the report.

## Artifact Structure

### Archived Raw Evidence

To keep the checked-in file count small, [raw-evidence.tar.gz](raw-evidence.tar.gz) contains 1,368 raw evidence files at their original paths relative to this directory.
The 37 unpacked files retain the index, top-level summaries and matrices, and files linked directly from this index or the presentation report.
Directory names in the evidence index describe the logical dataset, including archived files.
The archive SHA-256 is `03338772f1e34b572369144e76a8a2b67fe10e303bbb5133c11acfc5ca63510b`.
Every archived file was extracted to a temporary directory and verified against its original SHA-256 before the unpacked original was removed.

Inspect the archive with `tar -tzf raw-evidence.tar.gz`.
Extract it into a separate scratch directory with `tar -xzf raw-evidence.tar.gz -C /path/to/scratch`.
Paths inside recorded commands and manifests are historical collection paths; archiving does not rewrite their contents.
Large service logs are stored as `service.log.gz`; use `gzip -cd` to read them.
Lossless compression of 131 service logs reduced their total size from 262,045,764 to 18,126,179 bytes before archiving.

### Disposable Storage Cleanup

On 2026-09-20, disk cleanup removed 44 completed-cell `data/` directories from `buffered-eight`, `buffered-eight-midpoints`, `buffered-eight-final`, and `buffered-eight-smoke`, reclaiming 19.94 GiB.
These directories contained generated Sea runtime storage; their journals are no longer retained.
No benchmark services were running during cleanup.
All 502 remaining files in those four campaigns had identical SHA-256 hashes before and after deletion, preserving measurement results, manifests, and logs.
Source files, optimized builds, and other campaigns were not removed.
The later check-in cleanup removed the remaining 158 per-run `data/` and `tiny-storage/` directories after verifying each directory's adjacent result and backend configuration.
These generated journals, lock files, and Tinylicious Git summary stores are not needed to analyze the recorded measurements.
All 1,405 evidence files outside runtime storage were verified unchanged, or identical after decompression, before consolidation into the archive.

Each wrapped run records its command, revision, branch, working-tree status, timing, environment, and exit status in `run.json`.
`tracked.patch` captures tracked working-tree changes, not the contents of untracked files.
`command.log` contains command output.
An exit code of zero for a campaign means the collector finished; it does not mean every workload passed.

Service campaign `cells/manifest.json` files record all planned cells and SHA-256 hashes of the native server, WebAssembly client, and measurement scripts.
Each cell retains its service log, runner log, and result with per-worker delivery checks, backlog, latency, generator resources, and sampled service resources.
`cells/results.json` is the completed aggregate, including unsuccessful cells.
Do not interpret an incomplete campaign as a complete aggregate.

The `sustainable` field checks offered-load delivery, per-worker latency, scheduling lag, missing operations, and errors.
It does not automatically check backlog trend.
Read the measured-window backlog curves before making a sustainable-rate claim.
The highest passing tested rate is a lower bound, not an exact service capacity.

Service RSS is the main process's resident set size, including its threads, not virtual memory or a general descendant-process sum.
CPU percentages use 100% for one fully occupied logical CPU.
Generator CPU totals include warmup and drain, so they are not measured-window-only CPU percentages.
Payload throughput counts one observer's application bytes, excluding writer echoes and wire overhead.

The original stress and transport-follow-up campaigns use Sea memory storage.
The `native-storage-fine` campaign explicitly selects memory or durable-file per cell and verifies the server's logged storage mode.
The `buffered-eight` campaigns additionally select buffered-file and allow eight service cores while keeping four separate generator cores.
Buffered-file writes reach the operating system without synchronization before acknowledgment; this is not power-loss durability or identical operation persistence to Tinylicious's in-memory database.
Sea durable-file synchronizes a replacement journal and its directory before write acknowledgment; the entire retained journal is copied on each mutation.
These short fresh-history measurements do not establish long-term capacity or qualify the filesystem/device for power-loss durability.
Tinylicious uses its default in-memory document/operation database and filesystem-backed Git summary storage.
The raw result label `default-in-memory-database` refers to the database, not all Tinylicious storage.
The browser TypeScript-local path uses `LocalSessionStorageDbFactory`, backed by browser `sessionStorage`.
Native WebTransport includes QUIC/TLS; the native benchmark-only WebSocket adapter uses the unencrypted loopback listener.
Neither this transport comparison nor the cross-stack comparison has identical security and durability costs.

In `followup-explore`, the four-core WebSocket 8,192-byte, 24,000 ops/s probe reached 4,168.50 MiB sampled service RSS at 10.51 seconds after workload start.
The 4 GiB guard terminated the service; the resulting connection resets are guard-triggered, not an isolated transport failure.
Keep this unsuccessful sample alongside the lower passing loads.

## Reproduction

Use a new output directory; the wrapper and campaign metadata refuse to overwrite existing artifacts.
Prepare optimized builds as described in the [measurement scripts guide](../../scripts/README.md) and [browser benchmark guide](../../tests/sea-integration-tests/README.md).
The recorded service affinity assumes at least 23 logical CPUs with the documented sibling layout.
Adapt affinity before using a different machine and record that change.

From the repository root:

```bash
node rust-service/scripts/presentation-run.mjs /tmp/sea-source-new \
  node rust-service/scripts/presentation-collect.mjs source /tmp/sea-source-new

node rust-service/scripts/presentation-run.mjs /tmp/sea-refinement-new \
  node rust-service/scripts/presentation-collect.mjs matrix /tmp/sea-refinement-new/cells \
  rust-service/measurements/2026-09-20/refinement-matrix.json

node rust-service/scripts/presentation-run.mjs /tmp/sea-repeated-new \
  node rust-service/scripts/presentation-collect.mjs repeat /tmp/sea-repeated-new/cells

node rust-service/scripts/presentation-run.mjs /tmp/sea-native-repeated-new \
  node rust-service/scripts/presentation-collect.mjs followup-repeat /tmp/sea-native-repeated-new/cells
```

The browser baseline's `run.json` contains its exact six-path command and affinity.
Use the same workload parameters, but choose a new artifact directory.
Do not run builds or other benchmarks concurrently with a measurement.
Editor processes and the virtual machine host were not isolated during this collection.

## Remaining Evidence Boundaries

These runs do not measure production services, wide-area networks, power-loss durability, idle memory, wire bandwidth, or many writers sharing one document.
Short runs retain their entire event history and do not demonstrate bounded long-term memory.
The source inventory includes tests and conditional code and does not claim equivalent functionality.
The optimized browser Fluid-adapter result is unfavorable to Sea and remains part of the report.

Successful repository build-gate logs and canonical Cargo gate logs were initially written under `/tmp` to avoid an in-progress JSON file invalidating the repository's own formatting gate.
Those logs did not survive the host reboot; their passes were observed during collection but cannot be independently checked from this directory.
Two longer Tinylicious boundary probes at 1,000 ops/s were also written under `/tmp` and lost; those exploratory probes are not part of the repeated campaign or its aggregate.
They informed the conservative 500 ops/s matched-load choice: the small-payload probe passed, while the large-payload probe exceeded the latency budget.
The retained refinement failures provide independent evidence of higher-load limits, but do not reconstruct those lost probes.

Follow-up validation logs retained here include `followup-rustdoc.log`, `followup-build.log`, and `followup-root-build.log` (passed).
`followup-test.log` retains the full-workspace native round-trip timeout; `followup-roundtrip-retry.log` retains its passing isolated retry.
The later full-workspace Clippy check also reported the unchanged server entrypoint's function-length violation; focused benchmark Clippy passed.
Final `followup-final-{fmt,rustdoc,build,test,root-build}.log` files record passing reruns after restoring the benchmark CLI's default executable.
The full test rerun passed without replacing the retained earlier timeout.
`followup-final-clippy.log` still records the server entrypoint's function-length failure.
Do not describe this follow-up as a clean all-gates validation pass.