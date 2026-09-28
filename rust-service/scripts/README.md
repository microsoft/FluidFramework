# Rust Service Scripts

These shell and Node.js entry points validate or measure the current benchmark harness.
The shell validation and measurement wrappers use a disposable source copy; the Node.js collectors use the current checkout and explicit output directories.
Copies exclude build outputs, installed dependencies, generated packages, Git metadata, and benchmark-result directories; each run uses a separate Cargo target directory and removes the copy and target on exit.

Stress, no-reader, summary, and cold-load runners create backend data in an owned directory directly under `/tmp`, independent of the artifact output directory.
This includes Sea event and content data, Tinylicious LevelDB data, and Tinylicious filesystem Git summaries.
Each result records the temporary path, filesystem type, mount source, and device identity.
The runner removes only its owned data directory after stopping the service and collecting file inventories.
Benchmark artifacts can therefore use persistent storage without moving either service's file-backend input/output off `/tmp`.
The no-reader runner gives its fixture a new child path inside the owned temporary root, because the fixture creates its own data directory.
Run its path and cleanup regression with `node --test rust-service/scripts/benchmark-no-reader.test.mjs`.

## Commands

`checkpoint1-pairs.mjs <artifact-directory> <cell>` runs the frozen cache comparison cells.
It preserves unsuccessful samples and normally requires a passing primary before running controls.
`--accepted-primary <report-path>` instead records the path and SHA-256 of an explicitly user-accepted primary evidence record.
Use that option only for a documented exception, not to turn an automatic failure into a pass.
It does not relax the selected control's gates.
Copy measurement artifacts to persistent storage after each cell when using temporary data directories.

| Task | Script |
| --- | --- |
| Build in an explicit source-specific target and stage final native executables locally | [`build-benchmark-artifacts.sh`](build-benchmark-artifacts.sh) |
| Format, unit tests, Clippy, and bounded correctness smoke | [`validate-benchmarks.sh`](validate-benchmarks.sh) |
| Release build and one `measure` workload; JSON lines to stdout | [`measure-benchmarks.sh`](measure-benchmarks.sh) |
| Copy preparation and manifest-integrity helpers; source rather than execute | [`benchmark-common.sh`](benchmark-common.sh) |
| Required README presence and local links; optional paths restrict roots | [`check-documentation.mjs`](check-documentation.mjs) |
| Record command, source/machine metadata, log, and exit status | [`benchmark-run.mjs`](benchmark-run.mjs) |
| Source inventory or repeated stress campaigns | [`benchmark-collect.mjs`](benchmark-collect.mjs) |
| Bounded Linux Sea/Tinylicious client comparisons | [`benchmark-stress.mjs`](benchmark-stress.mjs) |
| Fluid summaries, persisted sizes, and process-cold loads | [`benchmark-summaries.mjs`](benchmark-summaries.mjs) |

Use new artifact output directories outside the repository; format completed JSON before retaining it.
The output location does not select the service-data filesystem.
`check-documentation.mjs` covers Cargo packages, direct harnesses, architectural groupings, historical READMEs, and current top-level guides; it checks local paths, not anchors or external URLs.

### Native Build Verification

`build-benchmark-artifacts.sh` writes `target/release/benchmark-build.json` only after a successful build and staging.
The receipt identifies native workspace inputs and each staged executable by SHA-256.
The script invalidates the previous receipt before building and rejects source changes during compilation.
Source, stress, and summary collectors verify the receipt before using default native executables.
Stress and summary campaigns check before recording their manifests, and individual runs check before starting a service.
A missing receipt, changed native source, or replaced executable stops collection with a rebuild command instead of running stale binaries.
Documentation-only edits do not invalidate the receipt.

This check covers repository native inputs and staged executables, not WASM, TypeScript output, arbitrary external build inputs, or concurrent edits after verification.
Keep sources and build outputs unchanged during collection.
Explicit `serverBinary` and `generatorBinary` stress overrides remain available for historical comparisons; their provenance is the caller's responsibility.
The separate browser benchmark's `--skip-build` option still requires the caller to prepare current native and WASM artifacts.

Run the receipt regression tests with `node --test rust-service/scripts/benchmark-artifacts.test.mjs` from the repository root.

### Collection Modes

`benchmark-collect.mjs --help` lists `source`, `repeat`, `native-repeat`, and `matrix`.
Each takes a new output directory; `matrix` also takes a JSON array of stress-runner workload objects.

- `source`: pinned `cloc` plus the release `presentation-test-spans` binary. Scope follows local non-development dependencies, includes conditional/test code, and retains paths/spans; it is not linked-code reachability or feature equivalence.
- `repeat`: ten fresh runs per point, alternating backend order at 500 ops/s, with three seconds of warmup and ten seconds measured.
- `native-repeat`: ten paired four-core native runs, higher WebSocket loads, and 750 ops/s Tinylicious on one/four service cores.
- `matrix`: custom workload configurations.

### Summary and Cold-Load Setup

`benchmark-summaries.mjs` uses the built current-version Fluid test runtime and drivers, real SharedMaps, and on-demand Fluid summaries.
Build the client packages, Tinylicious, and native benchmark artifacts first; use the same certificates as the stress runner.
The native build requires an explicit source-specific target directory and copies only final executables to this worktree's `target/release` directory:

```bash
CARGO_TARGET_DIR=/path/to/source-specific-target bash rust-service/scripts/build-benchmark-artifacts.sh
```

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
The `hash` option generates **pseudorandom hex text** from deterministic SHA-256 hashes; its 16-character alphabet remains compressible.
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

Build Routerlicious, generated Sea clients, browser-test certificates, and the native benchmark artifacts first.
Use `CARGO_TARGET_DIR=/path/to/source-specific-target bash rust-service/scripts/build-benchmark-artifacts.sh` for the native artifacts.
The runner uses production client libraries without SharedTree/container runtime and verifies payloads and ordered delivery to writer and observer.
Sea defaults to release native service/WASM clients over loopback WebSocket; Tinylicious uses its normal server/Socket.IO client and in-memory operation database.
Both retain history; their default persistence guarantees differ.

Service affinity uses CPUs 2; 2,4,6,8; or 0,2,4,6,8,10,12,14 for one/four/eight cores.
Four generators use separate physical cores by default.
Set `generatorProcesses` to as many as eight for capacity campaigns; generators use CPUs 16,18,...,30 and documents must divide evenly across them.
Native offered rates must also divide evenly across the selected generator count.
Sea uses the built-in live-cache default when `liveCache` is omitted; set it to `false` only for an explicit storage-backed control.
Results record the effective cache state and generator layout.
Editor/host activity is not isolated.
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

#### Closed-Loop Throughput

For acknowledgment-driven native Sea traffic, set `loadMode` to `closed-loop` and omit `rate`.
This mode sends the next operation on each document as soon as its previous acknowledgment arrives.
It does not use a high offered rate as a substitute for backpressure.
Readers consume continuously; explicit subscription shedding is reported separately, not retried.
Write failures and unexpected reader failures still fail the sample.
The existing resource/deadline guards remain active; the timing-record cap replaces the paced outstanding-delivery guard.

```bash
SEA_MAX_CONNECTIONS=128 SEA_EXPERIMENTAL_RESOURCE_POLICY=true \
node rust-service/scripts/benchmark-stress.mjs run \
	'{"backend":"sea","generator":"native","loadMode":"closed-loop","transport":"websocket","storage":"durable-file","liveCache":true,"payloadBytes":64,"documents":32,"cores":8,"seconds":10,"warmupSeconds":3}' \
	/tmp/sea-closed-loop-sample
```

Use the native artifact build described above, or explicit `serverBinary` and `generatorBinary` paths.
The primary result is `acknowledgedOperationsPerSecond`; `shedReaders`, `shedMissing`, per-reader outcomes, and `losslessDelivery` describe the delivery side.
Report `writeOperationsPerSecond` (the acknowledgment-rate alias) and `readOperationsPerSecond` separately.
Read throughput sums validated application-event deliveries across writer echoes and observers, with each recipient counted once per delivery and acknowledgments excluded.
Both rates use completion times in the measured window, including warmup writes completed during that window and excluding drain completions.
Per-reader `receivedInWindow` counters retain the fanout breakdown, including readers later shed.
Read throughput is `null` for older generators without these counters; legacy observer-only delivery rates are not a substitute.
The acknowledgment count includes completions inside the measured window regardless of when the write started.
Aligned CPU uses `acknowledgmentEpochMicros`, rather than the observer delivery timestamps used in paced mode.
The legacy aligned CPU-per-delivered-operation field consequently has acknowledgments as its denominator here.
`sustainable` is `null`, since this mode has no offered-rate target.
One outstanding write per document bounds client write concurrency, but may be round-trip-limited.
These results do not establish a global server maximum or a hard memory bound.
If shedding occurs, report that later traffic served fewer readers.

#### Streamed Throughput

For transport-backpressured streaming, select native Sea WebTransport and set `loadMode` to `streamed`.
Omit `rate`.
The benchmark generates the next frame after the previous transport write completes, without waiting for an application acknowledgment.
Acknowledgments and both readers run independently.
This uses shared wire-protocol frames, not a new production session-client API.

```bash
SEA_MAX_CONNECTIONS=128 SEA_EXPERIMENTAL_RESOURCE_POLICY=true \
node rust-service/scripts/benchmark-stress.mjs run \
	'{"backend":"sea","generator":"native","loadMode":"streamed","transport":"webtransport","storage":"durable-file","liveCache":true,"payloadBytes":64,"documents":32,"cores":8,"seconds":10,"warmupSeconds":3}' \
	/tmp/sea-streamed-sample
```

Default transport windows are unchanged and can buffer substantial unacknowledged work before suspending writers.
Inspect outstanding operations/encoded bytes, pending transport writes, drain duration, and reader shedding alongside acknowledgment throughput.
Outstanding encoded bytes are not process-memory measurements; summed per-document peaks are not a simultaneous global peak.
The worker fails if complete frames, acknowledgments, and non-shed readers do not drain within 30 seconds by default.
Streamed mode accepts an explicit `drainTimeoutSeconds` from 1 through 120 for slow backends.
Values above 30 extend the outer wall-clock guard to 180 seconds without changing the measured interval or exact drain requirements.
Failed samples retain diagnostics but are not accepted throughput results.
The parent result deadline includes a reporting margin beyond that drain deadline.
See the [worker metrics and limitations](../crates/sea-benchmarks/README.md#streamed-throughput).

For native Sea generation, run `CARGO_TARGET_DIR=/path/to/source-specific-target bash rust-service/scripts/build-benchmark-artifacts.sh`, then add `"generator":"native"` and `"transport":"websocket"` or `"transport":"webtransport"` to the workload.
The native worker uses a single-thread Tokio runtime per pinned process.
Paced and closed-loop modes use the shared session client; streamed mode uses independent WebTransport directions.
Paced mode adds one ordered submission queue per document; closed-loop mode submits directly after each acknowledgment.
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
