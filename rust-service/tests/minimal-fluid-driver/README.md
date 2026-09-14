# Minimal WASM Fluid driver

This isolated package adapts the generated `fluid-webtransport-browser` WASM package to the smallest Fluid driver surface exercised by the iteration trace. It does not decode FSQ2. TypeScript constructs only the documented FSP4 create, open-session, submit, latest-snapshot, and publish-snapshot envelopes that the generated package validates; projected reads, ambiguity resolution, blobs, and summaries use generated WASM methods.

## Implemented interfaces

- `IDocumentServiceFactory`: create with an optional full summary and load by resolved URL.
- `IDocumentService`: storage, bounded delta storage, and explicit delta connection creation.
- `IDocumentStorageService`: versions, snapshot trees, immutable blob create/read, full summary upload/download.
- `IDocumentDeltaStorageService`: bounded projected pages filtered to the requested sequence interval.
- `IDocumentDeltaConnection`: submission and push-driven operation events through one bounded projected-operation subscription.
- Explicit lifecycle extensions: `waitForIdle()`, `disconnect()`, `reconnect()`, `recoverPending()`, and caller-driven `resubmitPending()`.

## Unsupported interfaces and semantics

- Signals, nacks, presence, automatic reconnect, hidden retry, offline merge, summary handles, summary attachments, loading groups, and GC/retention guarantees.
- Summary upload accepts full trees only. Incremental handle reuse and parent concurrency are not implemented.
- `getSnapshot`, caching, auth, production certificates, Routerlicious, and ODSP compatibility are not implemented or claimed.
- The native server owns a bounded set of concurrent connection futures. The SharedTree Chromium trace uses three independent Fluid containers and three generated `BrowserClient` transport sessions. Each document service serializes access to its non-reentrant generated client; serialization is not shared across containers.
- Browser loading uses Fluid's default read-to-write replacement. The document service preserves one projected identity, session, cursor, and last position across replacement; read-first services reuse the explicitly synthetic remote member because FSP4 does not yet carry production membership operations. Node contracts cover replacement plus disconnected-before-commit and committed-after-response-loss recovery.

## Submission and subscription lifecycle

When the generated client provides `openSubmissionStream`, the driver writes contiguous client sequence numbers to one stream and consumes acknowledgements in the same order. A submission remains in `pending` until its acknowledgement arrives or projected local operation is observed. Write failures and response loss reject `waitForIdle()` without discarding pending identity, so callers can use `recoverPending()` and explicitly `resubmitPending()` when the service reports `notCommitted`. Resubmission intentionally uses the unary request path.

Clients without `openSubmissionStream` continue to submit through unary requests. Reconnect closes the old submission stream, cancels the old projected-operation subscription, reconnects the generated client, and opens replacements. Explicit disconnect and disposal also close and cancel their owned resources. Subscription restart and explicit synchronization resume from the last projected cursor.

The driver does not automatically retry, recover, or resubmit ambiguous writes. Callers must wait for a failed submission chain, reconnect, resolve each pending identity, and resubmit only `notCommitted` operations. Disposal is synchronous at the Fluid interface boundary while stream close and subscription cancellation complete asynchronously.

## Validation

The package is registered in the root pnpm workspace. Install that workspace,
then use its Fluid build graph to build client dependencies, generate the Rust
WASM packages, typecheck the driver and SharedTree harnesses, and build the
browser bundles in dependency order.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir rust-service/tests/minimal-fluid-driver run build
pnpm --dir rust-service/tests/minimal-fluid-driver test
```

The package's `build:wasm` task uses Fluid build's declarative input/output
tracking. It invokes Cargo and `wasm-bindgen` only when the Rust workspace inputs
or generated Node/web packages change; Cargo provides an additional incremental
cache when the task does run. The installed `wasm-bindgen` CLI version must match
the workspace crate version.

A future first-class Cargo/WASM Fluid build task could derive narrower inputs
from Cargo metadata, validate Rust target and `wasm-bindgen` tool versions, and
model individual generated packages without package-owned globs. The current
declarative task already provides hash-based incremental execution, so this is a
tooling refinement rather than a prerequisite for reliable client builds.

The unit suite includes an injected TypeScript submission-stream fixture. It deterministically holds acknowledgements, rejects writes or responses, records stream and subscription disposal, and verifies unary fallback without requiring a live service.

For Chromium, generate the existing browser harness certificate, start
`fluid-webtransport-native`, and run:

```bash
pnpm run typecheck:shared-tree
pnpm run build:shared-tree
node browser/run-headless.mjs "$PWD" <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> __sharedTreeResult shared-tree.html
```

## Deterministic SharedTree comparison benchmark

The benchmark runs the same two-client SharedTree workload through the Rust local service, TypeScript local service, Rust WebTransport service, or Tinylicious. It uses the repository's standard Mocha benchmark tooling, so cases are selected with `--grep` and results are written through the standard benchmark reporter. The harness owns temporary data, ports, certificates, Chromium, and service processes.

Install the root workspace and incrementally build the benchmark package from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir rust-service/tests/minimal-fluid-driver run bench:build
```

The build uses Fluid build's dependency graph and declarative WASM task. Unchanged TypeScript dependencies, browser bundles, Rust crates, and generated WASM packages reuse their normal build caches. The installed `wasm-bindgen` CLI version must match the workspace crate version.

Tinylicious belongs to the separate Routerlicious pnpm workspace. Install that workspace once before selecting the Tinylicious case:

```bash
pnpm --dir server/routerlicious install --frozen-lockfile
```

Run all six cases with the default performance configuration of eight repetitions, 1,000 measured edits, 100 warmup edits, and observer-converged batches of 10 edits:

```bash
pnpm --dir rust-service/tests/minimal-fluid-driver run bench:run
```

Use case aliases and flags for focused runs:

```bash
pnpm --dir rust-service/tests/minimal-fluid-driver run bench:run -- \
  --case rust-memory,rust-durable \
  --workload messages \
  --operations 1000 \
  --warmup 100
```

Run `pnpm --dir rust-service/tests/minimal-fluid-driver run bench:run -- --help` for all flags. Case aliases are:

- `rust-local`: Rust local memory
- `local`: TypeScript local service
- `rust-memory`: Rust WebTransport memory
- `rust-buffered`: Rust WebTransport buffered file
- `rust-durable`: Rust WebTransport durable file
- `tinylicious`: Tinylicious

`--case` accepts comma-separated aliases and may be repeated. For arbitrary selection, `--grep <pattern>` passes a regular expression to Mocha. The lower-level `bench` script remains available for standard Mocha flags and environment-only automation.

Configure the workload through environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BENCHMARK_REPETITIONS` | `8` | Browser samples per selected case. |
| `BENCHMARK_OPERATIONS` | `1000` | Measured edits per sample. |
| `BENCHMARK_WARMUP` | `100` | Unmeasured edits per sample. |
| `BENCHMARK_WORKLOAD` | `batched` | `batched`, `turns`, or `messages`. |
| `BENCHMARK_OPERATIONS_PER_TURN` | `10` for `batched`; otherwise `1` | Override edits per JavaScript turn. |
| `BENCHMARK_SYNCHRONIZE_PER_TURN` | enabled for `batched` and `messages` | Override observer convergence after each turn. |
| `BENCHMARK_BROWSER_TIMEOUT_MS` | `30000` or `180000` | Per-sample browser timeout. |
| `BENCHMARK_ARTIFACT_DIR` | `benchmark-results` | Detailed JSON output directory, relative to this package unless absolute. |
| `BENCHMARK_CPU_PROFILE_PATH` | unset | Chromium CPU profile base path. |
| `BENCHMARK_SKIP_BUILD` | unset | Skip selected-case native or Tinylicious incremental builds. |

`batched` defaults to 10 edits per JavaScript turn and waits for both containers to observe each batch before continuing. This permits Fluid batching while respecting bounded protocol frames and subscription queues across every backend. `turns` defaults to one edit per turn without backpressure and is useful for stressing bounded queues. `messages` also defaults to one edit per turn but waits for both containers to observe every edit before continuing, providing an unambiguous one-operation-per-convergence workload.

The `bench:run` wrapper enables complete failure diagnostics and writes both reporter streams to stdout, so redirecting it with `> log.txt` retains the full errors.

For example, compare selected cases using strict message delivery:

```bash
pnpm --dir rust-service/tests/minimal-fluid-driver run bench:run -- \
  --case rust-memory,local \
  --workload messages \
  --operations 1000 \
  --warmup 100
```

After a successful setup run, pass `--skip-build` for the shortest rerun path. The harness still starts fresh service processes and uses fresh temporary data for every selected case.

### Profiling

Select one configuration and provide a Chromium profile base path:

```bash
pnpm --dir rust-service/tests/minimal-fluid-driver run bench:run -- \
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

The first clean provisional run is recorded in the [SharedTree comparison evidence](../../benchmarks/shared-tree/13401fe0de3/README.md).

These baseline results are provisional because they predate the default read-to-write lifecycle and projected-operation subscription. The retained iteration 0008 evidence compares the same workload after both changes. Only the Rust binding currently exposes wire-byte counters. Compare convergence, startup, and observed edit latency with those differences labeled; do not present the numbers as production capacity, durability, or equivalent Routerlicious/ODSP evidence.
