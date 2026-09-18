# Final Sea WebTransport Benchmark Evidence

Evidence commit: `7f22a862585e84d48c728461c53b4dd946ee2e9e`

Benchmark source commit: `294c803e8c4aa711df5dee19dc5711e6aead5f33`

Status: final controlled-local evidence

## Workload

This directory retains a nine-arm matrix across direct dummy, direct SharedTree, and Fluid-integrated SharedTree paths and memory, buffered-file, and durable-file storage.
Every arm used two clients, three repetitions, 10 unmeasured warmup operations, 100 measured operations, one operation per turn, and final convergence rather than synchronization after every turn.
Every raw artifact reports `sourceDirty: false` and the benchmark source commit above.

The evidence commit follows the measured source by one commit.
That commit only makes browser disconnect logical and idempotent and prints already-implemented server transport measurements at shutdown; it does not change the measured event, author, snapshot, content, storage, or SharedTree data paths.

## Environment

- Debian GNU/Linux 13, Linux `6.8.0-1064-azure`, x86-64
- AMD EPYC 9V74 80-Core Processor, 32 logical CPUs exposed to the container
- Node.js `22.23.2`
- Headless Chrome `152.0.0.0`
- Localhost WebTransport with a pinned development certificate
- Fresh service data and browser state for each selected case

## Commands

The matrix was built and run from `rust-service/` with explicit cases and counts:

```bash
pnpm --dir tests/minimal-fluid-driver run bench:build
pnpm --dir tests/minimal-fluid-driver run bench:run -- \
  --case rust-memory-direct,rust-buffered-direct,rust-durable-direct \
  --dds dummy --repetitions 3 --operations 100 --warmup 10 \
  --report benchmark-results/final-294c803e/direct-dummy-report.json
pnpm --dir tests/minimal-fluid-driver run bench:run -- \
  --case rust-memory-direct,rust-buffered-direct,rust-durable-direct \
  --dds shared-tree --repetitions 3 --operations 100 --warmup 10 \
  --report benchmark-results/final-294c803e/direct-shared-tree-report.json
pnpm --dir tests/minimal-fluid-driver run bench:run -- \
  --case rust-memory,rust-buffered,rust-durable \
  --dds shared-tree --repetitions 3 --operations 100 --warmup 10 \
  --report benchmark-results/final-294c803e/fluid-shared-tree-report.json
```

The real-browser transport and shutdown evidence used the generated production WASM package and the documented browser harness.
The server received a shutdown-marker path as its final argument, and the browser command set `SEA_SNAPSHOT_POLICY=sea`.

## Results

All values are arithmetic means across three successful samples.
RSS is the service's peak resident set sampled by the harness.

| Path | Storage | Operations/s | Convergence ms | Startup ms | CPU s | Peak RSS KiB |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Direct dummy | Memory | 2,501.54 | 39.93 | 66.83 | 0.07 | 7,664 |
| Direct dummy | Buffered file | 2,809.09 | 35.07 | 64.87 | 0.07 | 7,800 |
| Direct dummy | Durable file | 1,714.12 | 57.87 | 68.57 | 0.09 | 7,736 |
| Direct SharedTree | Memory | 917.35 | 73.07 | 105.30 | 0.08 | 8,264 |
| Direct SharedTree | Buffered file | 932.30 | 70.87 | 100.50 | 0.08 | 8,304 |
| Direct SharedTree | Durable file | 825.68 | 85.53 | 101.60 | 0.10 | 8,360 |
| Fluid SharedTree | Memory | 661.01 | 105.20 | 234.47 | 0.14 | 8,832 |
| Fluid SharedTree | Buffered file | 678.97 | 101.63 | 230.20 | 0.14 | 8,892 |
| Fluid SharedTree | Durable file | 661.29 | 105.73 | 245.73 | 0.16 | 8,924 |

Every sample passed.
Both clients observed all 110 warmup and measured changes in every arm.
Direct samples ended at value 110; Fluid samples ended at value 112 because their lifecycle probe contributes two setup operations, and every Fluid sample recorded two resume cursors.

The historical pre-reuse direct-dummy memory measurement was 37.86 operations/s with 2,642.5 ms mean convergence.
The matching final memory arm measured 2,501.54 operations/s with 39.93 ms mean convergence, preserving the previously reported persistent-stream improvement of 2,295.24 operations/s and 44.27 ms.
The original baseline did not retain raw environment or per-repetition artifacts, and equivalent historical buffered-file and durable-file measurements do not exist.
This evidence therefore supports a before/after claim only for the common direct-dummy memory arm; the final cross-storage matrix is an equivalent post-cleanup comparison.

## Stream And Lifecycle Evidence

The benchmark harness no longer reports removed adapter counters that were permanently zero.
CPU, RSS, convergence, and throughput above come from implemented process and benchmark measurements.
An independent generated-client Chromium run against the native server exercised event, author, snapshot, and content operations, consecutive live events, reconnect, Sea-selected snapshot publication, and graceful shutdown.
Its server measurements were:

```text
SHUTDOWN_EVIDENCE disposition=Cancelled owned_connections=3 cancelled_connections=3 elapsed_milliseconds=5093
TRANSPORT_EVIDENCE wire_bytes=3979 peak_connections=3 peak_streams=9 connection_cleanups=3 active_connections=0
```

Nine peak streams across three connections, despite multiple submissions, loads, content requests, snapshot updates, and reconnect activity, confirms that operations reuse logical streams rather than opening a WebTransport stream per operation.
The server stopped accepting on request, cancelled the three connections after the five-second drain deadline, completed all three connection cleanups, reached zero active connections, and exited.
The browser harness separately passed its shutdown assertion, and no owned service or browser process remained.

The regular Fluid path advertises immutable `ClientSelected` participation.
It never consumes Sea nomination as a schedule signal, so Fluid's existing summarizer election and cadence remain authoritative.
The final Fluid samples observed exactly the expected workload changes, while focused integration tests cover client-selected suppression and publication conflict handling.
The direct SharedTree and browser paths use `SeaSelected` participation and require the current nomination fence.

## Artifacts And Limits

[results.json](results.json) is the compact reviewed aggregate.
The three top-level `*-report.json` files retain the benchmark reporter output, and the three path directories retain all nine detailed artifacts with per-repetition data and provenance.

These localhost results establish behavior for one machine, browser, document, writer, and observer.
They are not production service capacity, durability, packet-level bandwidth, Routerlicious, or ODSP measurements.
Wire bytes are Sea application frame bytes, not HTTP/3, QUIC, UDP, or TLS bytes.
The transport counters came from the broader real-browser workflow rather than from each benchmark arm.