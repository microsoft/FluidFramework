# Rust Service Scripts

These shell and Node.js entry points validate or measure the current benchmark harness.
The shell validation and measurement wrappers use a disposable source copy; the Node.js collectors use the current checkout and explicit output directories.
Copies exclude build outputs, installed dependencies, generated packages, Git metadata, and benchmark-result directories; each run uses a separate Cargo target directory and removes the copy and target on exit.

## Commands

| Task | Script |
| --- | --- |
| Format, unit tests, Clippy, and bounded correctness smoke | [`validate-benchmarks.sh`](validate-benchmarks.sh) |
| Release build and one `measure` workload; JSON lines to stdout | [`measure-benchmarks.sh`](measure-benchmarks.sh) |
| Copy preparation and manifest-integrity helpers; source rather than execute | [`benchmark-common.sh`](benchmark-common.sh) |
| Required README presence and local links; optional paths restrict roots | [`check-documentation.mjs`](check-documentation.mjs) |
| Record command, source/machine metadata, log, and exit status | [`benchmark-run.mjs`](benchmark-run.mjs) |
| Source inventory or repeated stress campaigns | [`benchmark-collect.mjs`](benchmark-collect.mjs) |
| Bounded Linux Sea/Tinylicious client comparisons | [`benchmark-stress.mjs`](benchmark-stress.mjs) |
| Fluid summaries, persisted sizes, and process-cold loads | [`benchmark-summaries.mjs`](benchmark-summaries.mjs) |

Use new output directories outside the repository; format completed JSON before retaining it.
`check-documentation.mjs` covers Cargo packages, direct harnesses, architectural groupings, historical READMEs, and current top-level guides; it checks local paths, not anchors or external URLs.

### Collection Modes

`benchmark-collect.mjs --help` lists `source`, `repeat`, `native-repeat`, and `matrix`.
Each takes a new output directory; `matrix` also takes a JSON array of stress-runner workload objects.

- `source`: pinned `cloc` plus the release `presentation-test-spans` binary. Scope follows local non-development dependencies, includes conditional/test code, and retains paths/spans; it is not linked-code reachability or feature equivalence.
- `repeat`: ten fresh runs per point, alternating backend order at 500 ops/s, with three seconds of warmup and ten seconds measured.
- `native-repeat`: ten paired four-core native runs, higher WebSocket loads, and 750 ops/s Tinylicious on one/four service cores.
- `matrix`: custom workload configurations.

### Summary and Cold-Load Setup

`benchmark-summaries.mjs` uses the built current-version Fluid test runtime and drivers, real SharedMaps, and on-demand Fluid summaries.
Build the client packages, Tinylicious, and the release Sea server with `websocket-stream` first; use the same certificates as the stress runner.
The runner owns isolated service processes, fresh data directories, dynamically selected loopback ports, and fresh client processes.
It requires Linux `taskset`; defaults reserve CPUs `2,4,6,8` for the service and `10,12` for the client.

```bash
node rust-service/scripts/benchmark-summaries.mjs run \
	'{"backend":"sea","storage":"buffered-file","mode":"incremental"}' /tmp/summary-sample
node rust-service/scripts/benchmark-summaries.mjs campaign \
	'{"repetitions":3}' /tmp/summary-campaign
node rust-service/scripts/benchmark-summaries.mjs report \
	/tmp/summary-campaign /tmp/summary-report
```

Run from the repository root and supply a new output directory.
Use `durable-file` for the other Sea backend, or `{"backend":"tinylicious","storage":"leveldb"}` for persisted Tinylicious.
Single-run options include `maps`, `entries`, `valueBytes`, `operations`, `entropy` (`hash` or `repeated`), `mode` (`full` or `incremental`), `serviceCpus`, and `clientCpus`.
Campaign options include `repetitions`, `sizes` (entries per map), `entropies`, and `operations`.
The default campaign has 72 samples: three repetitions, two sizes, two entropy profiles, two summary modes, and three backends.

Each sample attaches prepopulated maps, acknowledges a full baseline, changes one key, summarizes again, and appends a known tail.
Upload timing covers `uploadSummaryWithContext`; separate summarization timing includes generation through acknowledgment.
Download timing covers a fresh service's acknowledged snapshot and all unique blobs, with eight concurrent reads and content hashing.
Cold-load timing covers a separate restarted service and fresh client through container loading, all DDS realization, and tail replay; content verification follows outside the timed interval.
Client module imports and server startup are excluded, but lazy WASM initialization is included.
The OS page cache is not cleared: these are process-cold, not physical-media-cold reads.
Tinylicious can add service summaries on disconnect, so its latest snapshot can include server log-tail data.

The runner asserts actual summary handles for incremental mode, no handles for full mode, identical snapshot fingerprints across restart, every expected map value, and every persisted tail operation.
It checks Tinylicious's LevelDB `CURRENT` marker and records checkpoint-cleanup errors instead of suppressing them.
Per-phase inventories retain file names, apparent bytes, and allocated blocks; Sea mixes content and events in one journal, while Tinylicious separates LevelDB and filesystem Git storage.
Phase growth includes control records and metadata, and live inventories can precede background checkpoint work; stopped-service totals are retained separately.
No compaction, garbage collection, or durability-equivalence claim follows from these sizes.
The campaign retains manifests, binary/script hashes, successful and failed samples, and per-process logs, updating its result index after each sample.
The report command retains compact raw samples and median/minimum/maximum aggregates, replacing duplicated file inventories with counts and hashes.
Use repository Biome formatting before committing generated JSON.

### Stress Setup

Build Routerlicious, generated Sea clients, and browser-test certificates first.
The runner uses production client libraries without SharedTree/container runtime and verifies payloads and ordered delivery to writer and observer.
Sea defaults to release native service/WASM clients over loopback WebSocket; Tinylicious uses its normal server/Socket.IO client and in-memory operation database.
Both retain history; their default persistence guarantees differ.

Service affinity uses CPUs 2; 2,4,6,8; or 0,2,4,6,8,10,12,14 for one/four/eight cores.
Up to four generators use separate physical cores; editor/host activity is not isolated.
Set `SEA_MAX_CONNECTIONS=128` for more than eight document pairs.

Example bounded stress sample from the repository root:

```bash
SEA_MAX_CONNECTIONS=128 node rust-service/scripts/benchmark-stress.mjs run \
	'{"backend":"sea","rate":400,"payloadBytes":8192,"documents":16,"cores":4,"seconds":5,"warmupSeconds":1}' \
	/tmp/sea-benchmark-sample
```

Use `tinylicious` as the backend for the matching comparison.
Each document has one writer and one observer; this does not test many writers contending on a shared document.
The `sustainable` field is a bounded-run classification: at least 98% of offered operations are submitted and observed during the measured window, no observed corruption/order/errors or missing deliveries after draining, and each generator's p95 delivery latency and maximum scheduling lag stay within 100 ms.
Worker p95 values are not combined into a pooled percentile.
Backlog time series must also be inspected before making a sustained-capacity claim.
Tests stop at 8,192 outstanding operations or 1,000,000 submissions per generator, a 4 GiB sampled service-memory guard, or a fixed command deadline.
These are experimental guardrails, not strict peak-memory enforcement.
Payload throughput counts delivery to one remote observer per document, excluding the writer's echo and protocol overhead; actual network bytes are not measured.
Service CPU and memory cover the owned service process, which currently has no companion service processes in these configurations.
Generator resource totals are separate and include warmup and draining.

For native Sea generation, build `cargo build --release -p sea-benchmarks --bin presentation-native` from `rust-service/`, then add `"generator":"native"` and `"transport":"websocket"` or `"transport":"webtransport"` to the workload.
The native worker uses the shared session client with one ordered submission queue per document and a single-thread Tokio runtime per pinned process.
Its benchmark-only WebSocket adapter uses bounded tungstenite messages and independent child sockets; it is not a new supported production client.
WebTransport pins the server certificate and includes QUIC/TLS; the local WebSocket listener is unencrypted, so the comparison is not equal-security transport performance.
Sea defaults to memory storage; set `"storage":"buffered-file"` or `"storage":"durable-file"` to measure either file backend.
The harness verifies the server's logged storage mode before starting workers and records the selected modes in the campaign manifest.
Buffered-file writes an unsynchronized journal; durable-file synchronizes once per event batch under its [qualified power-loss model](../crates/sea-file-durable/README.md#power-loss-model).
Both recover complete history into memory, making duration and retained history essential parameters.
Tinylicious's in-memory operation database and filesystem Git summaries are not durability-equivalent to Sea durable-file.
For Tinylicious, set `"storage":"leveldb"` to select its file-backed database, or `"storage":"memory"` for an explicit in-memory selection.
The harness sets `db__inMemory` and a fresh per-cell `db__path`, and checks the LevelDB `CURRENT` marker after workers create documents and connect, before starting load.
Both modes use separate filesystem Git summary storage.
The [historical LevelDB follow-up](../historical/measurements/tinylicious-leveldb-fixed/README.md) records the adapter repair and measured rates; use its pinned revision only when reproducing that experiment.
The 32-document workload uses four generator processes on four distinct physical cores; one-document runs use only one.

Run these commands from `rust-service/`:

```bash
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1
node scripts/check-documentation.mjs
```

The measurement scripts set source commit, build profile, filesystem, and storage-device metadata. They do not retain results automatically. Write exploratory output outside the repository; retain only evidence needed to support documented results, with its procedure, schema, and limitations.

Use `measure-benchmarks.sh` for current storage/decorator measurements and the [Fluid driver's benchmark runner](../tests/sea-integration-tests/README.md) for current local and WebTransport workflows.
The [historical evidence](../historical/measurements/README.md) preserves original command names and revisions; current Node.js tools use the `benchmark-` prefix.
The `presentation-native` and `presentation-test-spans` binary names remain stable for compatibility with recorded build commands.

The scripts require Bash, Node.js, Cargo, Git, tar, and standard Linux utilities used directly in their source. They add no dependencies and must leave the assigned `Cargo.toml`, `Cargo.lock`, and retained benchmark evidence unchanged.
