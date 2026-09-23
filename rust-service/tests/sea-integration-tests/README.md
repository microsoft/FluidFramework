# Sea Fluid and SharedTree Integration Harness

This package owns Fluid/SharedTree integration tests, browser traces, and comparison benchmarks.
It consumes local and remote sessions through `sea-driver`'s `SeaSessionDriverClient`; reusable implementations and generated WebAssembly (WASM) belong to the packages below.

## Ownership and Coverage

Package-specific regressions and contracts live with their implementations:

- [sea-driver](../../packages/sea-driver/README.md) owns Fluid storage, sequence projection, membership, signals, submission recovery, and lifecycle contracts and tests.
- [sea-tree](../../packages/sea-tree/README.md) owns the direct SharedTree host and its two-peer collaboration test.
- [sea-typescript](../../packages/sea-typescript/README.md) owns neutral session tests, consumer type assertions, and generated WASM artifacts.

This harness retains SharedTree-based ServiceClient integration tests, browser traces, and comparison benchmarks.
It aggregates the package-owned tests without moving their dependencies back into the harness.
The browser trace loads package-owned JavaScript and WASM and closes a session at submission admission to test explicit recovery deterministically.
Browser benchmarks explicitly close their memberships and local service and verify that each Rust-backed sample loads only its selected capability's generated artifacts.
The native server owns a bounded set of concurrent connections; browser traces report actual session openings, including read-to-write replacement and explicit reconnection.

Shared [Chromium lifecycle support](browser/chromium.mjs) owns the browser, profile, temporary files, and Chrome DevTools Protocol connection.
Startup/commands have deadlines; disconnect rejects pending commands, and every exit path cleans up, escalating termination after five seconds.
Controlled-child tests cover startup timeout and ignored `SIGTERM`.
Runners own their page servers and assertions.

## Validation

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir server/routerlicious install --frozen-lockfile
pnpm --dir rust-service/tests/sea-integration-tests run build
pnpm --dir rust-service/tests/sea-integration-tests test
```

The package `build` script builds dependencies, generates the Rust WASM packages, checks formatting and lint, typechecks, and builds all browser bundles.
The package `test` script depends on that complete build and runs the harness Mocha tests, package-owned driver and direct SharedTree regressions, neutral session tests and type assertions, and the real Chromium transport matrix.
Ordinary `test:mocha:esm` discovery includes integration and payload tests, Chromium lifecycle regressions, and all twelve benchmark cases as correctness tests.
Without performance mode, the benchmark defaults are one repetition, ten measured operations, and one warmup operation; convergence and resume assertions still run.
These tests require Chromium, the Rust toolchain, and the separate Routerlicious workspace dependencies for Tinylicious.
For an incremental correctness run, use `pnpm exec fluid-build rust-service/tests/sea-integration-tests --task test:mocha:esm` from the repository root.
To build and test the entire Rust service, including the Cargo workspace, run `./test.sh` from `rust-service/`.

The neutral package's `build:wasm` task tracks inputs/outputs and skips unchanged generation.
The installed `wasm-bindgen` CLI version must match the workspace crate version.

| Suite | Coverage |
| --- | --- |
| `src/test/*.spec.ts` | ServiceClient attachment/reload/collaboration under both presets; captured payload. |
| `src/test/*.bench.ts` | Comparison cases with convergence/resume assertions, also run as correctness tests. |
| `browser/trace.mjs` | Summary reload, two-client delivery, explicit pre-commit recovery/resubmission, duplicate-free reconnect, bounded history. |
| [Browser matrix](../webtransport-browser/README.md) | Neutral and ServiceClient presets/compression, transport selection, shutdown. |

The trace and ServiceClient matrix run in `test:browser` and `rust-service/test.sh`.
The legacy Loader-based SharedTree trace below is separate.

Generate the browser harness certificate, start `sea-webtransport-server`, then run from this package:

```bash
pnpm run typecheck:shared-tree
pnpm run build:shared-tree
node browser/run-headless.mjs "$PWD" <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __sharedTreeResult shared-tree.html
```

## Deterministic Fluid Service Comparison Benchmark

The benchmark runs the same two-client operation workload through the Rust local service, TypeScript local service, Rust WebTransport service, or Tinylicious. By default it uses a minimal benchmark SharedObject that counts applied operations and submits a captured SharedTree operation body. It also generates one compressed ID per operation, causing Fluid's runtime to add the same ID-allocation message and grouped-batch envelope observed in the SharedTree workload. This keeps service and Fluid runtime serialization costs representative while removing SharedTree processing from the default measurement.

Pass `--dds shared-tree` to use a real SharedTree with the optimized forest implementation. Both modes use the same benchmark loop and validate writer/observer convergence. The selected DDS is recorded in the suite name and detailed JSON configuration.

The harness uses the repository's standard Mocha benchmark tooling, so cases are selected with `--grep` and results are written through the standard benchmark reporter. It owns temporary data, ports, certificates, Chromium, and service processes.

Install the root workspace and incrementally build the benchmark package from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir rust-service/tests/sea-integration-tests run bench:build
```

The build uses Fluid build's dependency graph and declarative WASM task. Unchanged TypeScript dependencies, browser bundles, Rust crates, and generated WASM packages reuse their normal build caches. The installed `wasm-bindgen` CLI version must match the workspace crate version.

Comparison browser bundles are minified and define `process.env.NODE_ENV` as `production` for every backend.
The native Sea service and generated WASM use Cargo release builds; the WASM build also enables SIMD.
Results from earlier unminified bundles are not interchangeable with this configuration.

Tinylicious belongs to the separate Routerlicious pnpm workspace. Install that workspace once before running the unfiltered correctness suite or selecting the Tinylicious performance case:

```bash
pnpm --dir server/routerlicious install --frozen-lockfile
```

Tinylicious prerequisites use the incremental Fluid `compile` graph; a missing entrypoint triggers rebuilding.
Every run still uses fresh service/data setup and executes convergence assertions.

Run all cases with the quick default performance configuration of three repetitions, 250 measured edits, 10 warmup edits, and one edit per Fluid batch without per-batch synchronization:

```bash
pnpm --dir rust-service/tests/sea-integration-tests run bench:run
```

Use case aliases and flags for focused runs:

```bash
pnpm --dir rust-service/tests/sea-integration-tests run bench:run -- \
  --case rust-memory,rust-durable \
	--dds shared-tree \
  --workload messages \
  --operations 1000 \
  --warmup 100
```

Run `pnpm --dir rust-service/tests/sea-integration-tests run bench:run -- --help` for all flags. Case aliases are:

- `rust-local`: Rust local memory
- `rust-local-direct`: Rust local memory without the Fluid container/runtime
- `local`: TypeScript local service
- `rust-memory`: Rust WebTransport memory
- `rust-memory-direct`: Rust WebTransport memory without the Fluid container/runtime
- `rust-websocket`: Rust WebSocketStream memory
- `rust-websocket-direct`: Rust WebSocketStream memory without the Fluid container/runtime
- `rust-buffered`: Rust WebTransport buffered file
- `rust-buffered-direct`: Rust WebTransport buffered file without the Fluid container/runtime
- `rust-durable`: Rust WebTransport durable file
- `rust-durable-direct`: Rust WebTransport durable file without the Fluid container/runtime
- `tinylicious`: Tinylicious

`--case` accepts comma-separated aliases and may be repeated. For arbitrary selection, `--grep <pattern>` passes a regular expression to Mocha. The lower-level `bench` script remains available for standard Mocha flags and environment-only automation.

WebSocketStream cases explicitly select the streaming browser API, without ordinary WebSocket fallback, over unencrypted loopback `ws://`.
They use `SEA_STORAGE_MODE=memory` on the server and allowlist the browser page's allocated HTTP origin.
WebTransport memory cases use the same storage mode but include QUIC/TLS.
Tinylicious launches explicitly set `db__inMemory=true`, matching its default database configuration; Git summaries still use the filesystem.
Detailed remote results record the transport, endpoint, storage mode, and loaded WASM capability.

Configure the workload through environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BENCHMARK_DDS` | `dummy` | `dummy` for the captured-payload counting SharedObject or `shared-tree` for real SharedTree. |
| `BENCHMARK_REPETITIONS` | `3` | Browser samples per selected case. |
| `BENCHMARK_OPERATIONS` | `250` | Measured edits per sample. |
| `BENCHMARK_WARMUP` | `10` | Unmeasured edits per sample. |
| `BENCHMARK_WORKLOAD` | `turns` | `batched`, `turns`, or `messages`. |
| `BENCHMARK_OPERATIONS_PER_TURN` | `1` | Override edits per Fluid batch. |
| `BENCHMARK_SYNCHRONIZE_PER_TURN` | enabled for `messages` | Override observer convergence after each turn. |
| `BENCHMARK_BROWSER_TIMEOUT_MS` | `30000` or `180000` | Per-sample browser timeout. |
| `BENCHMARK_ARTIFACT_DIR` | `benchmark-results` | Detailed JSON output directory, relative to this package unless absolute. |
| `BENCHMARK_CPU_PROFILE_PATH` | unset | Chromium CPU profile base path. |
| `BENCHMARK_SKIP_BUILD` | unset | Skip selected-case native or Tinylicious incremental builds. |
| `BENCHMARK_REMOTE_TRANSPORT` | `webtransport` | Lower-level remote runner selection: `webtransport` or `websocket-stream`; case aliases set this automatically. |
| `BENCHMARK_HTTP_PORT` | dynamically allocated | Browser page server port; WebSocketStream cases allocate and allowlist it automatically. |

`turns` is the default throughput workload: it flushes one edit per Fluid batch without waiting for observer convergence after each edit, then waits for final convergence. `batched` has the same synchronization behavior but is intended for an explicit `BENCHMARK_OPERATIONS_PER_TURN` or `--operations-per-turn` value above one. `messages` waits for both containers to observe every edit before continuing, providing an unambiguous one-operation-per-convergence latency workload.

The table lists performance-mode defaults, enabled by `bench` and `bench:run`.
The performance defaults favor quick directional throughput comparisons. Increase repetitions and operations explicitly when collecting more stable performance data.

The `bench:run` wrapper enables complete failure diagnostics and writes both reporter streams to stdout, so redirecting it with `> log.txt` retains the full errors.
The report suite name includes the effective workload, operation count, warmup count, operations per turn, synchronization behavior, and repetition count.

For example, compare selected cases using strict message delivery:

```bash
pnpm --dir rust-service/tests/sea-integration-tests run bench:run -- \
  --case rust-memory,local \
  --workload messages \
  --operations 1000 \
  --warmup 100
```

After a successful setup run, pass `--skip-build` for the shortest rerun path. The harness still starts fresh service processes and uses fresh temporary data for every selected case.

### Profiling

Select one configuration and provide a Chromium profile base path:

```bash
pnpm --dir rust-service/tests/sea-integration-tests run bench:run -- \
  --case rust-memory \
  --workload messages \
  --operations 1000 \
  --repetitions 3 \
  --skip-build \
  --profile benchmark-results/browser.cpuprofile
```

The case slug is added to the profile filename and each repetition is retained, such as `browser-rust-webtransport-memory-1.cpuprofile` through `browser-rust-webtransport-memory-3.cpuprofile`. A one-repetition run keeps the case-specific name without a numeric suffix. The detailed JSON also records Linux service CPU and peak RSS when the harness owns an external service.

### Results and Agent Use

Mocha writes its standard aggregate report to `benchmarkOutput.json` by default. The harness additionally writes one detailed artifact per case and workload under `benchmark-results/`, including every repetition, environment and source metadata, workload semantics, distributions, observed values, and Rust FSP4 counters when available. Both paths are ignored locally.

For retained evidence, agents and humans should:

1. Build once, then use explicit `--case` aliases for the intended cases.
2. Set workload and counts explicitly and use a unique standard report path with `--report <path>`.
3. Parse both the standard report and each detailed artifact, verify `status`, configuration, sample count, and final observed values, and confirm no owned service remains.
4. Run from a clean committed harness so `sourceDirty` is `false`, then copy the detailed artifacts into a tracked evidence directory with a report describing the environment and semantic differences.

The first clean provisional run is recorded in the [SharedTree comparison evidence](https://github.com/CraigMacomber/FluidFramework/blob/74f3736e4afea1aa78600636e8b45a47243a6095/rust-service/historical/benchmarks/shared-tree/13401fe0de3/README.md).

These baseline results are provisional because they predate the default read-to-write lifecycle and projected-operation subscription. The retained iteration 0008 evidence compares the same workload after both changes. Only the Rust binding currently exposes wire-byte counters. Compare convergence, startup, and observed edit latency with those differences labeled; do not present the numbers as production capacity, durability, or equivalent Routerlicious/ODSP evidence.
