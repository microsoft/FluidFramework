# Paced single-writer SharedTree throughput

Status: provisional controlled-local evidence

This directory retains a six-arm comparison produced from commit
`8a1d4e690e48e08c112bcafefcfe58807ee6d236`. Every result reports a clean source
tree and uses two full Fluid containers, one writer, one observer, 500 warmup
edits, 5,000 measured edits, eight successful samples, and 10 numeric field
overwrites per JavaScript turn. Timing includes submission and convergence to
the final scalar value on both containers.

## Results

| Backend | Mean ops/s | Median | Min | Max | Std. dev. | Mean submit ms | Mean converge ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TypeScript local service | 3,116.84 | 3,101.54 | 3,096.93 | 3,179.85 | 28.18 | 1,074.75 | 529.54 |
| Rust local memory | 3,061.08 | 3,056.42 | 3,021.51 | 3,091.95 | 27.12 | 985.24 | 648.29 |
| Tinylicious | 569.31 | 542.42 | 350.88 | 719.97 | 126.40 | 934.71 | 8,305.91 |
| Rust WebTransport memory | 393.10 | 388.72 | 370.15 | 432.26 | 19.44 | 919.59 | 11,826.08 |
| Rust WebTransport durable file | 390.41 | 382.59 | 369.35 | 416.87 | 17.10 | 918.44 | 11,909.60 |
| Rust WebTransport buffered file | 389.81 | 388.68 | 370.50 | 407.53 | 12.72 | 919.29 | 11,919.61 |

Rust local memory is 1.8% below TypeScript local in this run. The three Rust
WebTransport means span less than 1%, so storage durability is not the limiting
factor. Their submissions finish in about 0.92 seconds; nearly all remaining
time is observer convergence.

Tinylicious has substantial run-to-run variation. This report uses the runner's
existing lower-middle median and sample standard deviation conventions.

## Profiling and diagnostics

One Rust WebTransport memory run measured 376.67 ops/s, 1,020.1 ms submission,
and 12,254.1 ms convergence. Its browser CPU profile covered 16.211 seconds and
was idle for 13,266.6 ms (81.8%). The largest active entries were benchmark
JavaScript (236.8 ms), program work (184.5 ms), `createBidirectionalStream`
(144.4 ms), the browser read binding (91.3 ms), and `serializeOp` (90.3 ms).
This is a waiting or delivery-cadence bottleneck, not browser or service compute.

A clean-source 1,000-edit sweep held workload shape constant and varied edits per
turn:

| Edits/turn | Measured batches | Submit ms | Converge ms | Ops/s |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1,000 | 303.1 | 19,150.9 | 51.40 |
| 2 | 500 | 278.7 | 13,080.1 | 74.86 |
| 5 | 200 | 255.5 | 4,093.1 | 229.96 |
| 10 | 100 | 266.8 | 2,489.5 | 362.81 |
| 20 | 50 | 270.0 | 1,184.5 | 687.52 |
| 50 | 20 | 239.5 | 389.7 | 1,589.32 |
| 100 | 10 | 238.4 | 286.0 | 1,906.94 |

Convergence closely follows delivered Fluid batch count, at roughly 20-25 ms
per observer batch over most of the range.

Two profile-backed experiments were rejected and reverted:

- Sending bounded `ProjectedRead` batches on the subscription stream left the
  5,000-edit result at 386.98 ops/s and 11,999.6 ms convergence. The service had
  no useful backlog at its send boundary; peak frames still represented one
  Fluid batch.
- Requesting immediate QUIC acknowledgements produced 383.65 mean ops/s across
  eight 1,000-edit samples versus 364.24 for a matched default-config run. The
  distributions overlapped broadly, the gain was only 5.3%, and the change
  required exposing a direct Quinn API dependency. It did not address the
  dominant cadence robustly, so it was reverted.

## Collection notes

The Rust WebTransport samples were collected as independent one-repetition
invocations because the pre-measurement subscription-resume probe can fail
before measured work. Memory needed 10 attempts for eight successful samples;
buffered and durable needed eight attempts each. Failed setup probes were
excluded before any measured workload. The normalized JSON files contain the
eight successful samples.

The Rust service CPU totals were 3.48 seconds for memory, 3.67 seconds for
buffered file, and 4.48 seconds for durable file. Their final and peak RSS values
are not directly comparable because independent invocations sampled the same
long-lived process at different times. Tinylicious used 7.88 CPU seconds, ended
at 231,904 KiB RSS, and peaked at 313,768 KiB.

## Evidence

The six top-level JSON files are the authoritative comparison. `profile/`
contains the profiled run and raw Chrome CPU profile. `cadence/` contains the
clean-source one-sample turn-size probes. All prior evidence directories remain
unchanged.

## Limitations

This is one machine, one browser version, one document, one writer, one observer,
and localhost networking. Operations per second counts requested SharedTree
field overwrites, not packets or sequenced messages. The benchmark proves final
state convergence; Fluid batching intentionally coalesces intermediate values.
The cadence sweep has one sample per point and is diagnostic rather than a
ranking dataset.
