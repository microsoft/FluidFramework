# Sea Fluid and SharedTree Integration Harness

This test package consumes [sea-driver](../../packages/sea-driver/README.md) and [sea-tree](../../packages/sea-tree/README.md).
The reusable Fluid implementation lives in `@fluidframework/sea-driver`; the runtime-free SharedTree host lives in `@fluidframework/sea-tree`.
Both expose only internal APIs through their `/internal` entrypoints.

This harness consumes neutral `sea-typescript` sessions through the driver-owned `SeaSessionDriverClient` adapter.
It owns local and browser test setup, integration tests, and benchmarks; the neutral package owns generated WebAssembly (WASM) builds and loading.
TypeScript does not construct or parse Sea protocol frames.
The same adapter accepts injected factories for local memory and browser WebTransport sessions.

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

The integration and transport runners share [Chromium lifecycle support](browser/chromium.mjs).
It owns Chromium, its profile and temporary files, and the Chrome DevTools Protocol (CDP) connection for one scenario.
CDP startup and commands have deadlines; connection loss rejects pending commands.
Cleanup runs after success, scenario failure, startup failure, and CPU-profile finalization failure, escalating browser termination after five seconds when needed.
Controlled-child regressions cover startup timeout both with normal termination and with a child that ignores `SIGTERM`.
Each runner still owns its page server and scenario assertions; benchmark workload and measurement logic remain separate.

## Validation

The package is registered in the root pnpm workspace. Install that workspace,
then use its Fluid build graph to build client dependencies, generate the Rust
WASM packages, typecheck the driver and SharedTree harnesses, and build the
browser bundles in dependency order.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir server/routerlicious install --frozen-lockfile
pnpm --dir rust-service/tests/sea-integration-tests run build
pnpm --dir rust-service/tests/sea-integration-tests test
```

The package `build` script builds dependencies, generates the Rust WASM packages, checks formatting and lint, typechecks, and builds all browser bundles.
The package `test` script depends on that complete build and runs the harness Mocha tests, package-owned driver and direct SharedTree regressions, neutral session tests and type assertions, and the real Chromium transport matrix.
Ordinary `test:mocha:esm` discovery includes integration and payload tests, Chromium lifecycle regressions, and all ten benchmark cases as correctness tests.
Without performance mode, the benchmark defaults are one repetition, ten measured operations, and one warmup operation; convergence and resume assertions still run.
These tests require Chromium, the Rust toolchain, and the separate Routerlicious workspace dependencies for Tinylicious.
For an incremental correctness run, use `pnpm exec fluid-build rust-service/tests/sea-integration-tests --task test:mocha:esm` from the repository root.
To build and test the entire Rust service, including the Cargo workspace, run `./test.sh` from `rust-service/`.

The neutral package's `build:wasm` task uses verified input/output tracking and skips unchanged generation.
The harness no longer has a transport-owned WASM build task or generated-client imports.
The installed `wasm-bindgen` CLI version must match the workspace crate version.

A future first-class Cargo/WASM Fluid build task could derive narrower inputs
from Cargo metadata, validate Rust target and `wasm-bindgen` tool versions, and
model individual generated packages without package-owned globs. The current
neutral-package task provides hash-based incremental execution.

The harness `src/test/*.spec.ts` suites verify ServiceClient attachment, reload, and SharedTree collaboration under both presets, plus the captured benchmark payload.
The neighboring `*.bench.ts` suite uses the same Mocha discovery and doubles as benchmark correctness coverage.
Driver summary and lifecycle regressions run from `sea-driver`; direct SharedTree collaboration runs from `sea-tree`.
The neutral package's own test command covers sessions and socket mechanics, including snapshot registration replacement and cancellation ownership.
The real Chromium harness runs the Fluid driver trace, plain and compressed neutral scenarios, ServiceClient collaboration and reopen under both presets with and without compression, and transport/shutdown checks.
Rust transport tests inject fragmented, coalesced, delayed, reset, malformed, and abandoned-response inputs without requiring browser timing.

The default browser page bundles `browser/trace.mjs` against the owning packages.
It verifies initial summary reload, independent two-client push delivery, pre-commit pending recovery and explicit resubmission, duplicate-free reconnect, and a finite bounded historical range.
It reports actual session openings rather than obsolete shared-transport assumptions or unavailable wire metrics, and closes all owned sessions.
This trace and the ServiceClient SharedTree matrix are part of `test:browser` and `rust-service/test.sh`.
The legacy Loader-based SharedTree trace below remains separately invoked.

For Chromium, generate the existing browser harness certificate, start
`sea-webtransport-server`, and run:

```bash
pnpm run typecheck:shared-tree
pnpm run build:shared-tree
node browser/run-headless.mjs "$PWD" <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __sharedTreeResult shared-tree.html
```

## Deterministic Fluid service comparison benchmark

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

Tinylicious prerequisites use the Routerlicious workspace's incremental Fluid `compile` graph.
Unchanged dependency builds are reused, while a missing Tinylicious entry point triggers a rebuild of that package.
This does not skip the browser workload, convergence assertions, or fresh service/data setup.
On the same development checkout, the former recursive compile command took 48.4 seconds; the warm incremental prerequisite check took 1.6 seconds across 22 tasks in 13 packages.
These timings describe local setup overhead, not service throughput or a clean-build comparison.

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
- `rust-buffered`: Rust WebTransport buffered file
- `rust-buffered-direct`: Rust WebTransport buffered file without the Fluid container/runtime
- `rust-durable`: Rust WebTransport durable file
- `rust-durable-direct`: Rust WebTransport durable file without the Fluid container/runtime
- `tinylicious`: Tinylicious

`--case` accepts comma-separated aliases and may be repeated. For arbitrary selection, `--grep <pattern>` passes a regular expression to Mocha. The lower-level `bench` script remains available for standard Mocha flags and environment-only automation.

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

`turns` is the default throughput workload: it flushes one edit per Fluid batch without waiting for observer convergence after each edit, then waits for final convergence. `batched` has the same synchronization behavior but is intended for an explicit `BENCHMARK_OPERATIONS_PER_TURN` or `--operations-per-turn` value above one. `messages` waits for both containers to observe every edit before continuing, providing an unambiguous one-operation-per-convergence latency workload.

The table lists performance-mode defaults, enabled by `bench` and `bench:run`.
The performance defaults favor quick directional throughput comparisons. Increase repetitions and operations explicitly when collecting more stable performance data.

The event-author stream removes a per-operation WebTransport stream-open latency floor.
On the same Linux host and Chromium 152, a three-repetition `rust-memory-direct` run with 100 measured dummy operations improved from 37.86 to 2,295.24 operations/s after stream reuse.
Mean final convergence fell from 2,642.5 ms to 44.27 ms while all clients still observed all 110 warmup and measured edits.
These are directional development measurements comparing baseline commit `b16f8d980bbebfe1e39b118fc9dcccb50a3e2a59` with this change, not production capacity claims.

The comparison used this command in a clean checkout of each source commit:

```bash
pnpm --dir rust-service/tests/sea-integration-tests run bench:run -- \
  --case rust-memory-direct \
  --dds dummy \
  --repetitions 3 \
  --operations 100 \
  --warmup 10
```

Before commit `30940207bc7e10081a3d9f364c9033b601c2cf5b`, every submission opened and closed a WebTransport bidirectional stream.
That commit reused one browser submission stream for ordered requests and acknowledgements while retaining the per-operation path as a temporary fallback.
The exact Linux distribution, kernel, CPU, memory, Node version, and raw per-repetition artifacts were not retained and are therefore unknown.

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

### Results and agent use

Mocha writes its standard aggregate report to `benchmarkOutput.json` by default. The harness additionally writes one detailed artifact per case and workload under `benchmark-results/`, including every repetition, environment and source metadata, workload semantics, distributions, observed values, and Rust FSP4 counters when available. Both paths are ignored locally.

For retained evidence, agents and humans should:

1. Build once, then use explicit `--case` aliases for the intended cases.
2. Set workload and counts explicitly and use a unique standard report path with `--report <path>`.
3. Parse both the standard report and each detailed artifact, verify `status`, configuration, sample count, and final observed values, and confirm no owned service remains.
4. Run from a clean committed harness so `sourceDirty` is `false`, then copy the detailed artifacts into a tracked evidence directory with a report describing the environment and semantic differences.

The first clean provisional run is recorded in the [SharedTree comparison evidence](../../historical/benchmarks/shared-tree/13401fe0de3/README.md).

These baseline results are provisional because they predate the default read-to-write lifecycle and projected-operation subscription. The retained iteration 0008 evidence compares the same workload after both changes. Only the Rust binding currently exposes wire-byte counters. Compare convergence, startup, and observed edit latency with those differences labeled; do not present the numbers as production capacity, durability, or equivalent Routerlicious/ODSP evidence.
