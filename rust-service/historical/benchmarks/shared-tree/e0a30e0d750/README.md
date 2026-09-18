# Ordered submission stream measurement

Status: provisional controlled-local evidence

This directory measures the Rust WebTransport memory arm after commit
`e0a30e0d75058b39103315441a2fb99e86e501c5` replaced one bidirectional stream per
submit with one ordered, document-bound submission stream. The browser writes
submission frames sequentially using Web Streams backpressure and drains ordered
`Submitted` responses independently. Projected operations remain the Fluid op
delivery path.

The workload matches the retained paced baseline in `../8a1d4e690e4/`: two full
Fluid containers, one writer, one observer, 500 warmup numeric overwrites, 5,000
measured overwrites, and 10 edits per JavaScript turn.

## Result

| Configuration | Mean ops/s | Median | Min | Max | Std. dev. | Mean submit ms | Mean converge ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Prior one-stream-per-submit baseline | 393.10 | 388.72 | 370.15 | 432.26 | 19.44 | 919.59 | 11,826.08 |
| Ordered persistent submission stream | 386.50 | 387.53 | 375.62 | 394.86 | 7.35 | 920.54 | 12,020.24 |

The persistent stream is 1.7% below the prior mean and therefore does not improve
throughput. Submission time is unchanged and observer convergence still dominates.
This falsifies the hypothesis that opening and awaiting one WebTransport stream
per submit caused the observed 20-25 ms per delivered Fluid batch.

The architectural change is retained because it removes unnecessary stream churn,
uses an existing ordered transport with native backpressure, and permits request
writes to proceed independently of earlier submit responses. It is not retained
as a measured throughput optimization.

## Rejected follow-ups

Two follow-up experiments also produced no gain and were reverted:

- Waiting only on `WritableStreamDefaultWriter.ready` and deferring each `write()`
  promise produced 340.14 ops/s on a 100-edit probe versus 340.37 before the
  change.
- Decoupling server request ingestion from ordered response writes with a bounded
  channel produced 341.06 ops/s on the same probe.

These results move the remaining investigation below application-level submit
response waits. The projected subscription drains available service backlog
without a timer, yet delivery still exhibits the same cadence.

## Collection notes

Eight successful samples required nine independent invocations. One invocation
failed the existing pre-measurement subscription-resume cursor probe and was
excluded before measured work. `results.json` contains every successful sample
and aggregate statistics. The runner reported the preceding commit plus a dirty
tree during collection; those exact source changes were then committed without
modification as the implementation commit named above.
