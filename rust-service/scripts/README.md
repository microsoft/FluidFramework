# Rust Service Scripts

These shell and Node.js entry points validate or measure the benchmark harness in a disposable source copy.
`sea-benchmarks` is already a workspace member, so the scripts preserve the manifest without rewriting membership.
Copies exclude build outputs, installed dependencies, generated packages, Git metadata, and benchmark-result directories; each run uses a separate Cargo target directory and removes the copy and target on exit.

## Commands

- [`validate-benchmarks.sh`](validate-benchmarks.sh) runs format checking, benchmark unit tests, strict Clippy, and the bounded correctness smoke across all backends.
- [`measure-benchmarks.sh`](measure-benchmarks.sh) builds the harness in release mode and forwards one `measure` workload to it. Results are newline-delimited JSON on standard output.
- [`benchmark-common.sh`](benchmark-common.sh) contains shared copy preparation and assigned-manifest integrity checks. Source it from another script; do not run it as a benchmark.
- [`check-documentation.mjs`](check-documentation.mjs) discovers every Cargo
	package under `crates/` and `examples/`, requires READMEs for those packages and
	each direct integration-test harness, requires READMEs for the important
	architectural grouping folders, and verifies local Markdown links. Explicit
	path arguments restrict the check to those roots.
- [`presentation-run.mjs`](presentation-run.mjs) records a command, source state, machine metadata, raw log, and exit status in a new result directory.
	Use an output directory outside the repository when running repository-wide format checks, then format completed JSON before retaining it.
- [`presentation-collect.mjs`](presentation-collect.mjs) inventories tracked source with pinned `cloc`, or runs a sequential alternating-backend stress matrix with source and binary hashes.
	Use `source <new-output-directory>`, `sweep <new-output-directory>`, `repeat <new-output-directory>`, or `matrix <new-output-directory> <cells.json>`.
	The repeat campaign predeclares ten fresh runs per point, alternates backend order at the 500 ops/s matched-resource load, and checks observed Sea throughput lower bounds with three seconds of warmup and ten seconds of measurement.
	Source scopes include tests and conditional code and follow local non-development dependency declarations, not linked-code reachability or equivalent product features.
	Build `presentation-test-spans` from `sea-benchmarks` in release mode before running `source`; it classifies inline Rust test modules with `syn`, not text-based brace matching.
	The inventory includes comment totals and a test/test-support subset, with exact paths and spans retained.
	`followup-explore <new-output-directory>` compares native Sea WebSocket/WebTransport boundary points and finer Tinylicious loads.
	`followup-tiny-retry <new-output-directory>` repeats the 750 and 1,250 ops/s probes after correcting fractional per-worker rate validation.
	`followup-repeat <new-output-directory>` predeclares ten repeats of paired four-core native transport loads, higher WebSocket loads, and 750 ops/s Tinylicious loads on one and four service cores.
- [`presentation-stress.mjs`](presentation-stress.mjs) runs bounded, minimal-client Sea/Tinylicious comparisons on Linux.
	It uses production client libraries without SharedTree or the container runtime, verifies payloads and ordered delivery to writer and observer, and records resource samples and failures.
	By default, Sea uses release-mode native service code, release-mode WASM clients, and the optional loopback WebSocket listener, not QUIC.
	Tinylicious uses its normal Node.js server and Routerlicious Socket.IO client, with in-memory database defaults.
	Both services retain history; these are not equivalent durable-storage tests.
	Service CPU affinity is one, four, or eight physical cores, while up to four generator processes use separate physical cores.
	The eight-core option uses CPUs 0,2,4,6,8,10,12,14; the one/four-core options retain CPUs 2 and 2,4,6,8 respectively.
	The editor and other host activity are not CPU-isolated.
	The script requires the built Routerlicious workspace, generated Sea clients, and browser-test certificates.
	It changes no production defaults; set `SEA_MAX_CONNECTIONS=128` when running more than eight document pairs.

Example bounded stress sample from the repository root:

```bash
SEA_MAX_CONNECTIONS=128 node rust-service/scripts/presentation-stress.mjs run \
	'{"backend":"sea","rate":400,"payloadBytes":8192,"documents":16,"cores":4,"seconds":5,"warmupSeconds":1}' \
	/tmp/sea-presentation-sample
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
Buffered-file appends reach the operating system without per-write synchronization; unlike Tinylicious's default operation database, it still writes an on-disk journal.
Durable-file appends new frames and synchronizes once per event batch; its interrupted-tail and synchronized-prefix integrity assumptions still require filesystem/device qualification.
Both file modes retain complete history in memory, so duration and retained history remain essential measurement parameters.
Tinylicious uses its default in-memory document/operation database and filesystem Git summary storage; it is not durability-equivalent to Sea durable-file.
For Tinylicious, set `"storage":"leveldb"` to select its file-backed database, or `"storage":"memory"` for an explicit in-memory selection.
The harness sets `db__inMemory` and a fresh per-cell `db__path`, and checks the LevelDB `CURRENT` marker after workers create documents and connect, before starting load.
Both modes use separate filesystem Git summary storage.
At revision `92ecf30f4a7`, LevelDB document connection fails with `Collection checkpoints not implemented.`; see the [retained attempts](../measurements/tinylicious-leveldb/README.md).
The [repaired follow-up](../measurements/tinylicious-leveldb-fixed/README.md) records the adapter compatibility fix, passing regression tests, and measured LevelDB rates.
This is a pre-load compatibility failure, not a throughput result or a durability qualification.
The 32-document workload uses four generator processes on four distinct physical cores; one-document runs use only one.

Run these commands from `rust-service/`:

```bash
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1
node scripts/check-documentation.mjs
```

The measurement scripts set source commit, build profile, filesystem, and storage-device metadata. They do not retain results automatically. Write exploratory output outside the repository; retain only evidence needed to support documented results, with its procedure, schema, and limitations.

The historical Wave 3 runner was retired during final core-migration acceptance because its network/backend cells no longer exist.
Historical reports remain unchanged; use `measure-benchmarks.sh` for current storage/decorator measurements and the [Fluid driver's benchmark runner](../tests/sea-integration-tests/README.md) for current local and WebTransport workflows.
Their results are not directly comparable with the retired matrix.

The scripts require Bash, Node.js, Cargo, Git, tar, and standard Linux utilities used directly in their source. They add no dependencies and must leave the assigned `Cargo.toml`, `Cargo.lock`, and retained benchmark evidence unchanged.
