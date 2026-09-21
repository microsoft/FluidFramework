# Dummy DDS and Real SharedTree Browser Comparison

Measured 2026-09-20 at `9cb45f707ab8cec4b981e6884e600c9108bc6347`.
The original six-path campaign had only presentation and evidence changes; the later WebSocketStream supplement includes benchmark-only transport selection changes.
The original 120 samples and 40 retained WebSocketStream samples passed, with ten samples per path and DDS mode.
One additional WebSocketStream campaign failed before an unchanged retry passed; see the supplement below.
The [presentation](../../PRESENTATION_REPORT.md#optimized-browser-results) shows paired columns and vertically stacked Mermaid charts without an embedded SVG.

## Workloads

- **Dummy DDS:** the lightweight counting SharedObject submits captured SharedTree operation bodies and generates representative ID-allocation traffic, without running SharedTree's tree processing.
- **Real SharedTree:** scalar edits through SharedTree, using the optimized forest implementation.

Both use one writer and one observer, 100 warmup edits, 1,000 measured edits, one edit per turn, no per-turn convergence wait, and final convergence checks.
Every sample recorded 1,100 applied changes on each client and the expected final scalar value.
An edit does not imply equal bytes or message counts between DDS modes.
Direct Sea paths omit Fluid container/runtime responsibilities; other Sea paths use the Fluid adapter.

Browser and service processes share the eight-core affinity set `8,10,12,14,16,18,20,22`.
Dummy DDS ran first, then SharedTree; path order was fixed, not randomized or interleaved.
External services persisted across their ten browser samples.
The shared VM, loopback networking, and fixed order limit causal interpretation.
These results measure application-client throughput, not service capacity or long-term memory use.

## Reproduction

Build the benchmark dependency graph with `pnpm --dir rust-service/tests/sea-integration-tests run bench:build`.
The captured native build uses Cargo release with the `websocket-stream` feature.
Browser bundles are minified with production `NODE_ENV`; WASM is release with SIMD.
Build logs, source revision, commands, environment, and tracked patches are in the archive; build artifact hashes are in the summary.
The Routerlicious workspace must already be built to use `--skip-build` with Tinylicious.

From the repository root, run the following once with `--dds dummy` and once with `--dds shared-tree`, choosing separate fresh artifact directories:

```bash
taskset -c 8,10,12,14,16,18,20,22 \
  node rust-service/tests/sea-integration-tests/scripts/run-benchmark.mjs \
  --case rust-local,rust-local-direct,local,rust-memory,rust-memory-direct,tinylicious \
  --dds dummy --workload turns --operations-per-turn 1 --no-synchronize-per-turn \
  --repetitions 10 --operations 1000 --warmup 100 --skip-build \
  --artifact-dir /absolute/path/to/fresh/results
```

The runner's stable `rust-*` aliases and raw backend identifiers are unchanged; presentation labels use Sea.
Exact collection commands, including the provenance wrapper and artifact directories, are retained in each archived `run.json`.

## Data and Chart

[summary.json](summary.json) includes all twelve raw result objects, wrapper metadata, artifact hashes, recomputed statistics, and both Mermaid chart definitions.
For each ten-sample group, the reported median averages the two central raw values.
The runner's lower-central aggregate median is retained unchanged inside each raw result, but is not used for the paired comparison.
Ranges are the observed minimum and maximum; table values round to whole edits/s.
Sample standard deviation and nearest-rank p95 are retained in the summary.

The original chart used Mermaid 11.17.2; its six-path definitions remain in `chart.definitions[].source`, and [comparison.svg](comparison.svg) is retained as an original-campaign artifact.
The presentation now embeds two Mermaid code fences, including WebSocketStream, with identical 0-10 axes and path order.
Both plot medians in thousands of edits/s, rounded to the nearest edit/s.
The charts show point estimates; ranges remain in the table.

## Evidence

`raw-evidence.tar.gz` retains 24 original files: build logs, campaign logs, wrapper records, tracked patches, and all twelve detailed result files.
Each archived file was checked byte-for-byte against its original before cleanup.
These original artifacts are unchanged; the WebSocketStream supplement adds a summary and a compact archive.

Archive SHA-256: `00ecb2836ff77e348dcc45ea29ff48334d8372045e8dea6151135fd8a1c33b4b`.

Validation: both optimized builds passed; all 120 samples passed the matched-configuration and convergence assertions; all table values and chart inputs matched recomputed raw-sample statistics.
Both chart panels rendered with six visible bars at wide and narrow preview widths.

## WebSocketStream Supplement

Collected later on 2026-09-20 at the same base revision, with benchmark-only changes captured in each wrapper's `tracked.patch`.
The new `rust-websocket` and `rust-websocket-direct` cases explicitly select the browser's `WebSocketStream` API, never ordinary WebSocket fallback.
They connect over unencrypted `ws://127.0.0.1` to the same release Sea server with `SEA_STORAGE_MODE=memory`.
The existing WebTransport memory cases also explicitly select server memory; they include QUIC/TLS.
Tinylicious's default is `db.inMemory=true`, now also pinned by the benchmark launcher; filesystem Git summaries remain a difference.
This matches the operation-storage choice and removes TLS from the new Sea paths, but does not make the protocols or stacks equivalent.

Use the reproduction command above with `--case rust-websocket,rust-websocket-direct`, once per DDS mode.
The workload, warmup, repetitions, affinity, production-minified bundle, and release WASM settings are unchanged.
Run order was dummy DDS, an unchanged retry of its failed Fluid case, then SharedTree; these additions were not interleaved with the original results.

The first dummy Fluid run failed on repetition 7 with a CDP `Runtime.evaluate` timeout and Chromium crash-handler messages.
The cause remains unisolated; the runner did not persist the earlier six sample results.
Its complete unchanged ten-sample retry passed.
The direct dummy group and both SharedTree groups passed initially; no complete passing group was discarded.
Two small real-SharedTree smoke samples also passed but are excluded from the throughput table.

[websocket-summary.json](websocket-summary.json) contains all four complete result objects, recomputed statistics, wrapper records, storage/transport assertions, and build hashes captured after validation.
`websocket-evidence.tar.gz` contains 21 byte-verified files, including the failed run log, all complete raw results, smoke evidence, source patches, and full validation output.
Archive SHA-256: `97d58a660a823f2bb1069e8e72bd7453b622510b3b40bc6c25eac1980676be40`.

Validation passed: all 40 retained samples had 1,100 observed edits on each client and the expected final value; the browser loaded only the WebSocket-capable WASM artifact.
Package compilation/typechecking, formatting/lint, all canonical Cargo checks, root `pnpm build:fast`, complete `./test.sh`, scoped policy, and documentation checks passed.
No production service or client implementation was changed.