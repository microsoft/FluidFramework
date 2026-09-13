# SharedTree Streaming Comparison Evidence

Harness source commit: `0d6069e5ecafcaf55ac5c067dbd42d5418064cb7`

Evidence status: provisional

## Workload

Both current backends ran the same deterministic browser workload from a clean committed checkout:

- two independent Fluid containers using the same scalar SharedTree schema;
- ten unmeasured warmup edits followed by 100 measured edits;
- sequential round-robin writers, with both views required to converge before the next edit;
- ten repetitions, each using a fresh Chromium profile and document;
- one long-lived service process per backend across its ten repetitions.

The Rust setup also delivered one operation to establish each opaque cursor, cancelled and reopened both subscriptions from those cursors, and required one post-resume pushed operation to converge before warmup. These probe operations are excluded from measured throughput and latency.

## Environment

- Debian GNU/Linux 13, Linux `6.8.0-1064-azure`, x86-64
- AMD EPYC 7763, 32 logical CPUs exposed to the container
- Chromium `152.0.7977.82`
- Rust and Cargo `1.98.1`; release profile for native and browser WASM builds
- `wasm-bindgen-cli 0.2.128`
- Node.js `24.21.0` for benchmark orchestration
- Node.js `22.23.2` for Tinylicious build and service execution
- Rust service used default connection/stream limits and a fresh temporary data directory
- Tinylicious used its default local configuration and port

Both raw artifacts report `sourceDirty: false` and identify the harness source commit above:

- [rust.json](rust.json)
- [tinylicious.json](tinylicious.json)

The pre-streaming committed Rust baseline is [13401fe0de3](../13401fe0de3/README.md).

## Results

| Backend | Median startup | Median run throughput | Median edit convergence | Median run p95 convergence |
| --- | ---: | ---: | ---: | ---: |
| Pre-stream Rust polling baseline | 1,271.1 ms | 13.31 ops/s | 58.1 ms | 113.9 ms |
| Post-stream Rust subscription | 1,225.0 ms | 39.98 ops/s | 28.8 ms | 29.7 ms |
| Tinylicious and `TinyliciousClient` | 199.9 ms | 213.81 ops/s | 4.7 ms | 4.9 ms |

Every post-stream Rust repetition recorded 497,714 FSP4 bytes, a 1,499-byte peak request/response frame, a 1,430-byte peak subscription frame, and queue depth zero for this sequential workload. The separate burst-oriented Chromium trace reached the enforced pending-frame bound of two. Both connections resumed from non-empty opaque cursors in every repetition. Median subscription reopen time was 30.0 ms and median first post-resume convergence was 30.1 ms.

The pre-streaming Rust runs transferred 519,343 to 523,035 FSP4 bytes and polled projected reads during convergence. Tinylicious does not expose equivalent wire, frame, queue, or resume counters through this harness.

## Comparability Limits

These results establish convergence for the same deterministic SharedTree workload; they are not a production service capacity comparison.

- The Rust path uses `Fluid.Container.ForceWriteConnection`; Tinylicious uses Fluid's default connection lifecycle.
- The pre-stream Rust result used projected-read polling. The post-stream result uses long-lived projected-operation subscriptions and calls only `waitForIdle()` while awaiting convergence.
- The Rust driver uses synthetic membership and sequence projection and does not implement the full production Fluid driver surface.
- Rust reports application-level FSP4 bytes, not HTTP/3, QUIC, UDP, or TLS bytes. No equivalent Tinylicious wire measurement was collected.
- No server CPU, memory, persisted-size, durability, packet-level bandwidth, or concurrent offered-load measurements were collected.
- Tinylicious is a local test service; this evidence does not represent Routerlicious or ODSP deployment behavior.

Use these results as deterministic implementation evidence and a signal for further investigation, not as a production speedup claim.
