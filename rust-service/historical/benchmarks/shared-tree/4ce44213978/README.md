# Full-driver single-writer SharedTree capacity

Status: provisional controlled-local evidence

This directory retains a six-arm comparison produced from commit
`4ce44213978284d566500269aa696a7f257db9bf`. Every result reports a clean source
tree and uses the same application workload: two full Fluid containers, writer
index `0`, observer index `1`, 1,000 warmup edits, 10,000 measured edits, and ten
independent repetitions. Each edit appends one number to a SharedTree array.

The writer submits the measured burst without waiting after each edit. Timing
ends only after both containers expose the exact expected array length and final
value. Operations per second is therefore:

`10,000 / (submission time + final observer convergence time)`

It is application-level logical SharedTree edit throughput, including local
Fluid processing and final convergence. It is not sequenced-message throughput,
packet throughput, multi-writer capacity, or production service capacity.

## Results

| Backend | Transport and acknowledgement guarantee | Mean ops/s | Median | Min | P95/max | Std. dev. | Mean submit ms | Mean converge ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tinylicious | localhost Tinylicious client/service; development-service guarantees | 3,327.6 | 3,342.5 | 3,216.5 | 3,393.6 | 61.2 | 1,320.9 | 1,685.2 |
| TypeScript local service | in-browser local driver and local service; volatile | 3,293.4 | 3,294.8 | 3,241.8 | 3,344.4 | 34.7 | 1,331.5 | 1,705.2 |
| Rust local memory | in-browser WASM service; volatile memory; no network transport | 3,254.0 | 3,261.8 | 3,172.0 | 3,322.7 | 48.5 | 1,358.2 | 1,715.5 |
| Rust WebTransport buffered file | localhost WebTransport; file-backed operation append without durable sync | 3,247.4 | 3,262.3 | 3,026.1 | 3,312.6 | 81.8 | 1,326.2 | 1,755.1 |
| Rust WebTransport memory | localhost WebTransport; volatile memory | 3,232.8 | 3,233.0 | 3,194.5 | 3,271.8 | 28.6 | 1,335.2 | 1,758.4 |
| Rust WebTransport durable file | localhost WebTransport; durable operation log and deployment authority | 3,210.9 | 3,211.4 | 3,102.7 | 3,272.6 | 52.8 | 1,343.6 | 1,771.6 |

The six means span 3.6%. Tinylicious was highest in this run, while durable Rust
WebTransport was 3.5% lower. The three Rust WebTransport storage modes span only
1.1%, and their distributions overlap. These results support the conclusion
that this localhost workload is dominated by SharedTree/browser processing and
final convergence, not a claim that the backends have equal capacity. More
repetitions, randomized run order, and isolated hosts would be needed for a
statistical ranking.

## Correctness and comparability

- All 60 measured repetitions passed final writer/observer convergence.
- Every arm used 10,000 measured edits, 1,000 warmup edits, two containers, and
  ten repetitions.
- Rust runs ended at count/value 11,002 because their common setup contributes
  two baseline edits. TypeScript local service and Tinylicious ended at 11,000.
  The benchmark records each converged baseline before warmup, so all arms still
  validate exactly 11,000 requested warmup-plus-measured appends.
- The Rust arms use the same native sequencer and Fluid projection. Storage mode
  changes only the operation/content backing implementation; durable file
  remains the product default.
- The Rust driver runs use the existing synthetic membership and force-write
  connection. TypeScript local service and Tinylicious use their standard full
  Fluid driver surfaces. No arm uses mock DDS operations or waits for each edit.
- Every JSON records `sourceDirty: false` and the same source commit.

## Environment and resources

All runs used Linux kernel `6.8.0-1064-azure`, an AMD EPYC 7763 host with 32
logical CPUs visible, Node.js `22.23.2`, and headless Chrome 152. External server
process measurements cover all ten repetitions and are diagnostic, not isolated
whole-system measurements.

| External service | CPU seconds | Final RSS KiB | Peak RSS KiB |
| --- | ---: | ---: | ---: |
| Rust WebTransport memory | 0.51 | 15,800 | 15,800 |
| Rust WebTransport buffered file | 0.57 | 16,080 | 16,080 |
| Rust WebTransport durable file | 0.61 | 15,760 | 15,760 |
| Tinylicious | 3.46 | 165,332 | 168,640 |

Rust local memory and TypeScript local service execute inside the benchmark
browser, so no separate service-process CPU or RSS is available. Browser and
whole-system resource use were not captured. The Rust WebTransport samples also
retain wire-byte, response-frame, subscription-frame, queue-depth, and resume
diagnostics; metrics unavailable from standard Fluid drivers remain `null`.

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
pnpm --silent run <backend-script> 10 10000 1000 [transport-url] [certificate-hash]
```

Networked services were started separately and their PID supplied through
`BENCHMARK_SERVER_PID`. Rust storage mode was selected through
`FLUID_SERVICE_STORAGE_MODE`. Each server was dedicated to one arm and all arms
ran serially on the same host.

## Limitations

This is one machine, one browser version, one document at a time, one writer,
one observer, localhost networking, and append-only numeric SharedTree content.
It does not exercise contention, multi-node routing, production membership,
authentication, retention, large summaries, service restarts, or power-loss
recovery. Buffered and memory results have weaker persistence guarantees than
durable file; throughput must not be compared without those labels.