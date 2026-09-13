# Fixed-size single-writer SharedTree capacity

Status: provisional controlled-local evidence

This directory retains a six-arm comparison produced from commit
`26186ca79751d4db3261e24d549b5b9b1e2db2c0`. Every result reports a clean source
tree and uses the same application workload: two full Fluid containers, writer
index `0`, observer index `1`, 500 warmup edits, 5,000 measured edits, and eight
independent repetitions. Each edit overwrites one numeric field in a fixed-size
SharedTree object.

The writer submits the measured burst without waiting after each edit. Timing
ends only after both containers expose the expected final scalar value.
Operations per second is therefore:

`5,000 / (submission time + final observer convergence time)`

This is application-level logical SharedTree edit throughput, including local
Fluid processing and final convergence. It is not sequenced-message throughput,
packet throughput, multi-writer capacity, or production service capacity.

## Results

| Backend | Transport and acknowledgement guarantee | Mean ops/s | Median | Min | Max | Std. dev. | Mean submit ms | Mean converge ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tinylicious | localhost Tinylicious client/service; development-service guarantees | 3,959.2 | 3,930.5 | 3,888.9 | 4,032.6 | 58.2 | 669.8 | 593.3 |
| Rust local memory | in-browser WASM service; volatile memory; no network transport | 3,873.0 | 3,863.7 | 3,699.0 | 3,961.3 | 85.3 | 710.0 | 581.5 |
| TypeScript local service | in-browser local driver and local service; volatile | 3,807.8 | 3,815.6 | 3,696.9 | 3,901.1 | 69.7 | 678.7 | 634.8 |
| Rust WebTransport memory | localhost WebTransport; volatile memory | 3,797.1 | 3,769.6 | 3,727.7 | 3,953.8 | 70.7 | 703.5 | 613.7 |
| Rust WebTransport buffered file | localhost WebTransport; file append without durable sync | 3,796.9 | 3,793.1 | 3,704.8 | 3,870.3 | 48.4 | 698.5 | 618.5 |
| Rust WebTransport durable file | localhost WebTransport; durable log and deployment authority | 3,767.2 | 3,759.4 | 3,661.4 | 3,868.5 | 62.5 | 707.5 | 620.0 |

The six means span 4.9%. Tinylicious was highest and durable Rust WebTransport
was 4.8% lower in this serial run. The three Rust WebTransport means span 0.8%.
Several distributions overlap, run order was not randomized, and only eight
samples were retained, so no statistical backend ranking is claimed.

Compared with iteration `0009`'s growing-array workload, mean throughput rose
from roughly 3,211-3,328 ops/s to 3,767-3,959 ops/s. More importantly, this
workload does not make every edit traverse an increasingly large sequence. This
directory supersedes iteration `0009` for service-overhead interpretation; the
older evidence remains valid for its append-heavy application workload.

## Correctness and comparability

- All 48 retained samples converged to the expected final value on writer and
  observer.
- Every arm used 5,000 measured overwrites, 500 warmups, two containers, and
  eight repetitions.
- Rust setup contributes two baseline scalar updates, recorded as
  `initialValue: 2`; TypeScript local and Tinylicious start at zero. Every sample
  ends exactly 5,500 requested updates after its recorded initial value.
- Writer `nodeChanged` counts are exactly 5,500. Observer counts are `2` because
  standard turn-based Fluid batching coalesces warmup and measured-burst
  notifications. These counts are diagnostics, not logical operation counts.
- Final scalar convergence proves the final state, not that every intermediate
  scalar assignment was independently sequenced or observed. The benchmark
  therefore measures requested application edits per end-to-end elapsed time.
- All arms retain their standard runtime batching. Tinylicious's public client
  does not expose an equivalent runtime-option override, so forcing immediate
  flush only on custom loaders would make the comparison unequal.
- Every JSON records `sourceDirty: false` and the same source commit.

## Calibration

A 10,000-edit Rust-local probe was rejected before submission because one
turn-based FSP4 submission payload exceeded the protocol's 512 KiB field limit.
Both 4,000 and 5,000 edits passed; 5,000 was selected as the largest tested round
common count.

Ten fast sequential WebTransport repetitions also failed deterministically at
repetition nine. Each sample opens two Fluid-container connections, while the
native service default permits 16 concurrent connections and prior browser
sessions had not aged out before the ninth sample. Eight repetitions preserve
the product server configuration and are used uniformly across all six arms.

## Environment and resources

All runs used Linux kernel `6.8.0-1064-azure`, an AMD EPYC 7763 host with 32
logical CPUs visible, Node.js `22.23.2`, and headless Chrome 152. External server
metrics cover all eight repetitions and are diagnostic, not isolated
whole-system measurements.

| External service | CPU seconds | Final RSS KiB | Peak RSS KiB |
| --- | ---: | ---: | ---: |
| Rust WebTransport memory | 0.42 | 14,980 | 14,980 |
| Rust WebTransport buffered file | 0.45 | 15,272 | 15,272 |
| Rust WebTransport durable file | 0.49 | 15,072 | 15,072 |
| Tinylicious | 2.74 | 159,752 | 166,728 |

Rust local memory and TypeScript local service execute inside the benchmark
browser, so no separate service-process CPU or RSS is available. Browser and
whole-system resource use were not captured.

## Reproduction

The retained files are the authoritative raw evidence:

- `rust-local-memory.json`
- `rust-webtransport-memory.json`
- `rust-webtransport-buffered-file.json`
- `rust-webtransport-durable-file.json`
- `typescript-local-service.json`
- `tinylicious.json`

The common runner invocation shape is:

```text
pnpm --silent run <backend-script> 8 5000 500 [transport-url] [certificate-hash]
```

Networked services were started separately and their PID supplied through
`BENCHMARK_SERVER_PID`. Rust storage mode was selected through
`FLUID_SERVICE_STORAGE_MODE`. Each server was dedicated to one arm and all arms
ran serially on the same host.

## Limitations

This is one machine, one browser version, one document at a time, one writer,
one observer, localhost networking, and last-writer-wins scalar SharedTree
content. It does not prove preservation of intermediate values or exercise
contention, multi-node routing, production membership, authentication,
retention, large summaries, service restarts, or power-loss recovery. Buffered
and memory results have weaker persistence guarantees than durable file;
throughput must not be compared without those labels.