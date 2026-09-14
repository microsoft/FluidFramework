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

The benchmark runs the same two-client, sequential round-robin SharedTree workload through either the minimal WASM driver and Rust service or the existing `TinyliciousClient` and Tinylicious service. Each operation is timed from the local edit until both views converge. Warmup operations are excluded. The runner emits one JSON document containing every repetition, environment and source metadata, startup and operation distributions, and Rust FSP4 byte counts when available.

From a clean repository checkout, install the root workspace and build the benchmark's Fluid dependencies:

```bash
pnpm install --frozen-lockfile
node node_modules/@fluidframework/build-tools/dist/fluidBuild/fluidBuild.js \
  --root "$PWD" --vscode rust-service/tests/minimal-fluid-driver
```

Generate the browser WASM package, native server, certificate, and browser bundles. The `wasm-bindgen` CLI version must match the workspace's `wasm-bindgen` crate version.

```bash
cd rust-service
sh tests/webtransport-browser/generate-cert.sh tests/webtransport-browser/.certs
CARGO_TARGET_DIR=/tmp/fluid-shared-tree-benchmark-wasm-target \
  RUSTFLAGS='--cfg=web_sys_unstable_apis' \
  cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release
wasm-bindgen \
  /tmp/fluid-shared-tree-benchmark-wasm-target/wasm32-unknown-unknown/release/fluid_webtransport_browser.wasm \
  --target web --out-name fluid_webtransport_browser \
  --out-dir tests/minimal-fluid-driver/pkg
CARGO_TARGET_DIR=/tmp/fluid-shared-tree-benchmark-native-target \
  cargo build --locked -p fluid-webtransport-native --release
cd tests/minimal-fluid-driver
pnpm run build:benchmarks
```

Start the native service from the repository root. Use the URL and certificate hash printed by the process in the Rust benchmark command below.

```bash
rm -rf /tmp/fluid-shared-tree-benchmark-data
mkdir -p /tmp/fluid-shared-tree-benchmark-data
/tmp/fluid-shared-tree-benchmark-native-target/release/fluid-webtransport-native \
  127.0.0.1:0 \
  rust-service/tests/webtransport-browser/.certs/cert.pem \
  rust-service/tests/webtransport-browser/.certs/key.pem \
  /tmp/fluid-shared-tree-benchmark-data
```

Tinylicious has a separate pnpm workspace. Install and build it with Node.js 22, which satisfies its transitive dependency engine ranges, then start it on its default port from the repository root:

```bash
cd server/routerlicious
pnpm install --frozen-lockfile
pnpm exec fluid-build packages/tinylicious --task compile
node packages/tinylicious/dist/index.js
```

With each service running separately, execute ten repetitions of 100 measured operations after ten warmups from `rust-service/tests/minimal-fluid-driver`:

```bash
mkdir -p benchmark-results
pnpm --silent run benchmark:rust 10 100 10 <WEBTRANSPORT_URL> <CERTIFICATE_SHA256_WITHOUT_COLONS> > benchmark-results/rust.json
pnpm --silent run benchmark:tinylicious 10 100 10 > benchmark-results/tinylicious.json
```

The generated WASM, bundles, certificates, service data, and local `benchmark-results/` directory are intentionally ignored. To retain benchmark evidence, run from a clean committed harness, verify `sourceDirty` is `false`, and copy the JSON into a tracked evidence directory with a report describing the environment and semantic differences.

The first clean provisional run is recorded in the [SharedTree comparison evidence](../../benchmarks/shared-tree/13401fe0de3/README.md).

These baseline results are provisional because they predate the default read-to-write lifecycle and projected-operation subscription. The retained iteration 0008 evidence compares the same workload after both changes. Only the Rust binding currently exposes wire-byte counters. Compare convergence, startup, and observed edit latency with those differences labeled; do not present the numbers as production capacity, durability, or equivalent Routerlicious/ODSP evidence.
