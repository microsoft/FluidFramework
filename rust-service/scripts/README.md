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
	Use `source <new-output-directory>`, `sweep <new-output-directory>`, or `matrix <new-output-directory> <cells.json>`.
	Source scopes include tests and conditional code and follow local non-development dependency declarations, not linked-code reachability or equivalent product features.
- [`presentation-stress.mjs`](presentation-stress.mjs) runs bounded, minimal-client Sea/Tinylicious comparisons on Linux.
	It uses production client libraries without SharedTree or the container runtime, verifies payloads and ordered delivery to writer and observer, and records resource samples and failures.
	Sea uses release-mode native code, release-mode WASM, and the optional loopback WebSocket listener, not QUIC.
	Tinylicious uses its normal Node.js server and Routerlicious Socket.IO client, with in-memory database defaults.
	Both services retain history; these are not equivalent durable-storage tests.
	Service CPU affinity is one or four physical cores, while up to four generator processes use separate physical cores.
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

Run these commands from `rust-service/`:

```bash
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1
node scripts/check-documentation.mjs
```

The measurement scripts set source commit, build profile, filesystem, and storage-device metadata. They do not retain results automatically. Redirect exploratory output outside [`../benchmarks/`](../historical/benchmarks/); evidence belongs there only after its procedure, schema, and limitations are reviewed and documented.

The historical Wave 3 runner was retired during final core-migration acceptance because its network/backend cells no longer exist.
Historical reports remain unchanged; use `measure-benchmarks.sh` for current storage/decorator measurements and the [Fluid driver's benchmark runner](../tests/sea-integration-tests/README.md) for current local and WebTransport workflows.
Their results are not directly comparable with the retired matrix.

The scripts require Bash, Node.js, Cargo, Git, tar, and standard Linux utilities used directly in their source. They add no dependencies and must leave the assigned `Cargo.toml`, `Cargo.lock`, and retained benchmark evidence unchanged.
