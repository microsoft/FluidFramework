# SharedTree Comparison Benchmark Evidence

Harness source commit: `13401fe0de31c2fde0e0a0c466c2ab76571ed6fe`

Evidence status: provisional

## Workload

Both backends ran the same deterministic browser workload from the committed minimal-driver benchmark harness:

- two independent Fluid containers using the same scalar SharedTree schema;
- ten unmeasured warmup edits followed by 100 measured edits;
- sequential round-robin writers, with both views required to converge before the next edit;
- ten repetitions, each using a fresh Chromium profile and document;
- one long-lived service process per backend across its ten repetitions.

The reported operations-per-second value is 100 divided by each repetition's total measured convergence time. It is not maximum offered-load throughput. Startup covers creation, attachment, connection, and loading the second container after the page starts; it excludes browser process launch.

## Environment

- Debian GNU/Linux 13, Linux `6.8.0-1064-azure`, x86-64
- AMD EPYC 7763, 32 logical CPUs exposed to the container
- Chromium `152.0.7977.82`
- Rust and Cargo `1.98.1`; release profile for native and browser WASM builds
- `wasm-bindgen-cli 0.2.128`
- Node.js `24.21.0` for the benchmark runner
- Node.js `22.23.2` for the Tinylicious service
- Rust service used its default connection/stream limits and a fresh temporary data directory
- Tinylicious used its default local configuration and port

Both raw artifacts report `sourceDirty: false` and identify the harness source commit above:

- [rust.json](rust.json)
- [tinylicious.json](tinylicious.json)

## Results

| Backend | Median startup | Median run throughput | Median edit convergence | Median run p95 convergence |
| --- | ---: | ---: | ---: | ---: |
| Rust service and minimal WASM driver | 1,271.1 ms | 13.31 ops/s | 58.1 ms | 113.9 ms |
| Tinylicious and `TinyliciousClient` | 194.9 ms | 58.24 ops/s | 4.6 ms | 4.8 ms |

The Rust runs transferred between 519,343 and 523,035 measured FSP4 bytes. Peak response size ranged from 1,499 to 2,827 bytes. The Tinylicious client does not expose equivalent wire-byte counters through this harness.

Tinylicious run throughput varied from 52.26 to 214.64 ops/s even though its per-run median edit latency stayed between 4.6 and 4.7 ms. Consumers should inspect the retained samples rather than infer a stable ratio from the aggregate medians.

## Comparability Limits

These results establish that the same deterministic SharedTree workload runs and converges through both paths. They are not an equivalent production service comparison:

- The Rust path uses `Fluid.Container.ForceWriteConnection`; Tinylicious uses Fluid's default connection lifecycle.
- The Rust driver explicitly waits for submission and polls projected reads; Tinylicious receives pushed operations.
- The Rust driver uses synthetic membership and sequence projection and does not implement the full production Fluid driver surface.
- Only the Rust path reports application-level FSP4 bytes; no equivalent Tinylicious wire measurement was collected.
- No server CPU, memory, persisted-size, durability, packet-level bandwidth, or concurrent offered-load measurements were collected.
- Tinylicious is a local test service; this evidence does not represent Routerlicious or ODSP deployment behavior.

Repeat the comparison after the planned default read-to-write lifecycle work removes the force-write exception. Until then, use these numbers to validate the harness and identify costs to investigate, not to claim relative production capacity.