# File Execution Refactor: End-to-End Measurements

Measured 2026-09-22, comparing committed Sea `5761a2bc481` (before) with `332ba4a1ac8` (after).
These measurements do **not** establish an overall end-to-end performance improvement.
At a reliable buffered load of 2,000 operations per second, small-event observer latency improved, but service CPU consumption increased.
Higher file-backed loads and durable storage remained unstable.
Concurrent, uncommitted storage changes in the main checkout were excluded by building archived commits.

The [project overview](../../PROJECT_OVERVIEW.md) records older service results at `92ecf30f4a7`.
The immediate pre-refactor version also failed to reproduce most of those threshold passes here.
Consequently, the difference from the overview cannot be attributed entirely to this refactor.
The historical table remains unchanged.

## Reliable Matched Loads

Each row passed all three repetitions on both revisions, with no final errors or missing deliveries and zero observer backlog when the measured window ended.
Values are before / after medians of three samples, including all attempts in these cells.
CPU consumption of 100% means one occupied logical core.
Resident set size (RSS) is the median of sample mean RSS values, in mebibytes (MiB).
Latency is the median of each sample's worst-worker 95th percentile, not a pooled percentile.

| Storage | Payload bytes | Offered operations/s | Delivered operations/s | Service CPU, % | Service RSS, MiB | Observer p95, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Memory | 64 | 24,000 | 24,001.4 / 23,996.7 | 273.09 / 275.11 | 100.76 / 100.80 | 1.673 / 1.999 |
| Memory | 8,192 | 12,000 | 11,999.2 / 11,997.8 | 225.09 / 226.03 | 803.36 / 803.45 | 2.078 / 1.964 |
| Buffered file | 64 | 2,000 | 1,999.6 / 1,999.9 | 138.59 / 179.92 | 45.84 / 46.35 | 0.982 / 0.791 |
| Buffered file | 8,192 | 2,000 | 2,000.0 / 2,000.0 | 136.76 / 160.41 | 48.26 / 48.70 | 1.027 / 0.982 |

Buffered small-event p95 decreased about 19%, while service CPU increased about 30%.
Buffered large-event CPU increased about 17%, with a roughly 4% p95 decrease.
Memory control CPU and RSS were nearly unchanged.
These are short-run observations, not confidence intervals or capacity estimates.
The refactor is not a general CPU efficiency improvement in this workload.

Buffered control backlog-quarter means were zero for every after sample.
Before samples had two nonzero quarter means, 2.6 and 0.7 pending operations, with all other quarters zero.
Quarter means sum each worker's mean sampled observer backlog over that quarter of the measured window.
This supports stability over these ten-second windows, not indefinite operation.

## All Threshold Outcomes

Pass counts are out of three attempts per revision.
The first six rows repeat the overview's eight-core offered loads, not its source revision.
The next six are lower-load follow-ups; the last two are the final buffered controls.

| Campaign | Storage | Payload bytes | Offered operations/s | Before passes | After passes |
| --- | --- | ---: | ---: | ---: | ---: |
| Overview load | Memory | 64 | 88,000 | 0/3 | 0/3 |
| Overview load | Memory | 8,192 | 38,000 | 1/3 | 2/3 |
| Overview load | Buffered file | 64 | 46,000 | 0/3 | 0/3 |
| Overview load | Buffered file | 8,192 | 30,000 | 0/3 | 0/3 |
| Overview load | Durable file | 64 | 2,000 | 0/3 | 0/3 |
| Overview load | Durable file | 8,192 | 160 | 1/3 | 1/3 |
| Lower load | Memory | 64 | 24,000 | 3/3 | 3/3 |
| Lower load | Memory | 8,192 | 12,000 | 3/3 | 3/3 |
| Lower load | Buffered file | 64 | 10,000 | 0/3 | 1/3 |
| Lower load | Buffered file | 8,192 | 6,000 | 1/3 | 2/3 |
| Lower load | Durable file | 64 | 500 | 1/3 | 1/3 |
| Lower load | Durable file | 8,192 | 80 | 2/3 | 1/3 |
| Buffered control | Buffered file | 64 | 2,000 | 3/3 | 3/3 |
| Buffered control | Buffered file | 8,192 | 2,000 | 3/3 | 3/3 |

All 84 attempts are retained: 38 passed, 45 completed but failed the workload criteria, and one failed before workers were ready.
A separate 500-small-operation/s buffered smoke test passed and is excluded from those totals.
The pre-load failure was before-refactor durable storage at 500 small operations/s, repetition two; workers reported socket resets.

At the overview's buffered loads, every after sample reached the generator's bounded-backlog guard before the measured window.
Reported zero measured deliveries in these cases do not mean zero service capacity.
The guard aborts load generation and skips the normal drain when that error is present.
Durable attempts included socket resets, missing deliveries, and long latency tails, including failures at 80 large operations/s.
These failures remain unresolved; they were not retried selectively or removed from the comparison.

At 10,000 buffered small operations/s, median delivered rates were 9,573.7 before and 7,815.0 after, but neither revision passed all repetitions.
At 6,000 buffered large operations/s, median delivered rates were 5,743.0 before and 5,998.8 after; the after revision still failed one repetition on latency.
Lower CPU at some overloaded points does not establish improved efficiency when delivered work and failures differ.
No new sustainable capacity limit or durable performance improvement is established.

## Method and Interpretation

- Native WebSocket on loopback, 32 documents with one writer and one observer each; each document has a serial submission queue.
- Eight service CPUs: `0,2,4,6,8,10,12,14`; four separate single-thread native generators on `16,18,20,22`.
- Three warmup seconds, ten measured seconds, fresh service and storage per sample; three repetitions per cell.
- Revision order was before/after in repetitions one and three, after/before in repetition two; cell order also reversed in repetition two.
- Workspace-backed ext4 on `/dev/loop4`, not `/tmp`; AMD EPYC 7763 virtual machine, Linux `6.8.0-1064-azure`, Rust `1.98.1`, Node.js `22.23.2`.
- `SEA_MAX_CONNECTIONS=128`; release builds with `websocket-stream`; the existing stress runner was byte-identical across revisions.
- Native generator and sequencer source were unchanged between revisions; each archived tree built its own binaries, whose hashes are retained.
- Pass criteria: at least 98% of offered operations submitted and observer-delivered in-window; every worker p95 and maximum scheduling lag at most 100 ms; no final errors or missing deliveries.
- Existing bounds remained: 8,192 pending operations and one million submissions per generator, sampled 4 GiB service RSS, ten-second normal drain, 120-second sample timeout.

Latency measures submission scheduling through observer receipt, not durable acknowledgment latency.
Observer throughput counts each operation once; writer echoes are verified separately.
The workload's pass flag does not directly require a matched acknowledgment count or test backlog trend.
Raw acknowledgment counts and backlog curves are retained.
`pendingAtLoadStop` in the summary sums raw `pendingAtEnd`: it is measured at normal window end or earlier load termination.
Missing data and absent latency percentiles remain null rather than becoming zero.

The machine is shared; editor, other local activity, virtual-machine scheduling, and filesystem activity were not controlled.
The disk-space cleanup occurred between the overview-load campaign and the lower-load campaigns, not between the paired revisions within a campaign.
Uncommitted main-checkout changes were never built into these service binaries.
No production code was changed for this investigation.
The result covers the committed refactor, not any later working-tree optimizations.

Tinylicious, the overview's four-core 500-operations/s Node/WebAssembly memory comparison, browser application workloads, and summary/cold-load workloads were not rerun.
The native eight-core RSS observations above do not replace that four-core Node/WebAssembly row.
Buffered early publication and durable synchronized acknowledgment remain different persistence guarantees.
This campaign does not verify crash recovery or power-loss behavior.

## Evidence and Reproduction

- [Summary](summary.json): per-cell counts, medians, ranges, error strings, and per-attempt backlog-quarter means.
- [Compressed raw evidence](raw.json.gz): all campaign manifests, complete samples, resource curves, worker results, service/runner logs, smoke result, collector source, and aggregation source.

Build each revision from a separate archived tree:

```bash
cargo build --manifest-path <archive>/rust-service/Cargo.toml --release --locked \
  -p sea-webtransport-server --features websocket-stream \
  -p sea-benchmarks --bin presentation-native --bin sea-webtransport-server
```

Provide the browser harness's certificate and key in each archive's expected `.certs` directory, then run the unchanged stress runner with fresh output on the same filesystem:

```bash
SEA_MAX_CONNECTIONS=128 node <archive>/rust-service/scripts/benchmark-stress.mjs run \
  '{"backend":"sea","generator":"native","transport":"websocket","storage":"buffered-file","rate":2000,"payloadBytes":64,"documents":32,"cores":8,"seconds":10,"warmupSeconds":3}' \
  <fresh-workspace-backed-output>
```

The compressed manifest embeds the exact collection script, configurations, order, timestamps, and binary hashes.
Sample storage directories were deleted after each service and its generators stopped; results and logs were preserved.
Both isolated release builds succeeded, the native smoke test passed, and aggregation verified 84 attempts, three repetitions per cell/revision, identical runner hashes, and lossless compression round-trip.
This was measurement and documentation work, not a new implementation validation or a rerun of the full repository test suite.

## Focused Durable Investigation

Follow-up measurements on 2026-09-22 isolate a cause of the small-event durable regression: the refactored factory's fixed **four-worker filesystem concurrency limit**.
The limit is shared by every document, mutation, and file read in that factory.
Workers remain occupied while durable mutations synchronize the journal, publish the cursor file, and synchronize its directory.
Increasing only this limit in an isolated diagnostic build restored the tested 1,000-operations/s workload without removing any synchronization or changing acknowledgment rules.
This establishes a bottleneck for this workload, not an optimal worker count or a complete explanation of remaining overhead.
No production source was changed for the investigation.

### Rate Probes

Only durable storage, 64-byte payloads, and the same 32-document/eight-service-core workload were tested.
The focused three-repetition ladder produced these outcomes:

| Offered operations/s | Before passes | After passes |
| ---: | ---: | ---: |
| 100 | 3/3 | 3/3 |
| 252 | 3/3 | 2/3 |
| 500 | 2/3 | 3/3 |
| 600 | 2/3 | 0/3 |
| 652 | 2/3 | 0/3 |
| 752 | 3/3 | 0/3 |
| 1,000 | 3/3 | 0/3 |
| 1,252 | 1/3 | 0/3 |
| 1,500 | 1/3 | 0/3 |

These are the refinement and boundary campaigns, not pooled with the earlier runs above.
Earlier single probes passed 100 on both revisions, passed 1,000 only before, and failed 4,000 on both.
Two additional 250-operations/s attempts were invalid: four native generators received fractional rates of 62.5 and rejected them before load.
They are retained as invalid attempts, not capacity failures; the external collector was then changed to reject such inputs before launching services.
The corrected probe used 252.
All 62 focused rate attempts, including those two invalid attempts, are retained.
Non-monotonic latency failures prevent treating 500 versus 1,000 as exact sustainable maxima.
The rate ladder was stopped once it provided a reproducible diagnostic workload.

### Controlled Worker-Count Experiment

The only behavioral edit for this experiment replaced the constant worker count in archived `332ba4a1ac8` with the diagnostic environment variable `SEA_DIAGNOSTIC_FILE_WORKERS`, defaulting to four.
Source files in the main checkout, including concurrent changes, were untouched.
The same diagnostic binary ran with both four and 32 workers.
The original pre-refactor binary was a separate control; it did not use this new diagnostic limit.

Three short repetitions used one warmup second and three measured seconds at 1,000 operations/s, alternating control order.
All nine runs eventually completed every acknowledgment after drain, even the overloaded four-worker runs.
Values below are medians of three samples:

| Version | Passes | Delivered operations/s | Worst-worker p95, ms | Service CPU, % | Observer backlog at window end |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before refactor | 3/3 | 996.7 | 11.61 | 88.26 | 6 |
| After, four workers | 0/3 | 478.3 | 2,485.64 | 51.18 | 1,564 |
| After, 32 workers | 3/3 | 997.0 | 12.05 | 123.91 | 5 |

Confirmation used the original three-second warmup and ten-second measurement, in order 32, four, 32 workers, without timing instrumentation:

| Worker count | Delivered operations/s | Worst-worker p95, ms | Passed | All acknowledgments completed |
| ---: | ---: | ---: | --- | --- |
| 32 | 998.7 | 12.70 | Yes | Yes |
| 4 | 453.8 | 5,932.17 | No | No |
| 32 | 999.0 | 14.97 | Yes | Yes |

Thus short runs reproduced the failure and the intervention, and the longer confirmation did not reverse the result.
The 32-worker variant still used about 40% more service CPU than the original at the matched short-run load.
Removing this throughput bottleneck does not establish that all refactor costs have been removed.
No higher-load capacity search was performed for the diagnostic variant.

### Wait-Time Evidence

Hardware profiling was unavailable (`perf` was not installed and `perf_event_paranoid` was four).
Instead, a separate isolated build added cumulative atomic timing counters and logarithmic histograms for worker waits, blocking dispatch, durable ordering, execution, and synchronization.
Sparse snapshots were emitted every 1,024 completed blocking operations.
The initial attempt reported only at drain, which this harness's service termination did not reach; that unsuccessful instrumentation run is retained.
Instrumented throughput is excluded from the performance tables above.

Means from each metric's last complete snapshot, in milliseconds:

| Stage | Four workers | 32 workers |
| --- | ---: | ---: |
| Shared worker-permit wait, all file work | 50.792 | 0.0034 |
| Blocking-thread dispatch, all file work | 0.0125 | 0.0400 |
| Durable ordering and initial task scheduling | 0.0029 | 0.0026 |
| Durable operation inside the worker | 7.057 | 11.988 |
| Journal sync | 2.094 | 3.288 |
| Atomic-file sync | 2.309 | 3.969 |
| Atomic-file parent-directory sync | 2.330 | 3.953 |

The timing populations include initialization, warmup, load, and work completed during drain, not only measured user operations.
Metrics are cumulative and read concurrently; the last complete snapshots can have different counts if termination interrupts a report.
They are not exact per-append accounting or pooled latency percentiles.
The source and complete histograms are retained for inspection.

Worker wait fell by orders of magnitude while synchronization itself remained expensive and became slower on average with more concurrency.
Durable ordering and blocking dispatch were much smaller than the four-worker permit wait.
This supports insufficient I/O concurrency, rather than exhausted CPU, as the dominant cause of this particular throughput collapse.
The experiment does not establish whether separating read and mutation budgets would improve fairness or reduce CPU overhead further.

### Follow-up and Evidence

A production follow-up should make the bounded worker policy configurable or appropriately sized, preserve cancellation and publication guarantees, and test read/write fairness across documents.
Hard-coding 32 from this single experiment is not a general sizing rule.
Keep a short passing/failing workload pair for diagnosis, then use repeated original-duration runs only after a proposed fix addresses the measured bottleneck.
A third backend or removal of durability barriers is not needed to demonstrate this cause.

The [compressed diagnostic evidence](durable-diagnosis.json.gz) contains all 62 rate attempts, all 16 diagnostic attempts, logs, configurations, acknowledgment counts, resource curves, original and instrumented source, and binary hashes.
The 16 diagnostic attempts comprise one initial worker-count probe, nine short controls, three timing attempts, and three longer confirmations.
The archive also retains the rate-collection script through its manifests and the evidence-packaging script.
The instrumented source differs from the worker-count-only source by timing counters and reporting; performance controls used the separately preserved worker-count-only binary.
The local diagnostic sources and binaries remain separate from the production checkout.

## Production Worker Policy

The follow-up implementation adds `open_with_worker_limit(root, limit)` to both file-storage factories.
Existing `open(root)` callers remain supported: durable storage now defaults to 32 concurrent filesystem operations per factory, while buffered storage retains four.
The limit is shared across documents and factory clones, remains bounded, and does not alter durable synchronization or publication rules.
Zero and unsupported limits are rejected before namespace creation.
The default is a starting point for tuning, not a universal optimum.

Regression tests cover policy-specific defaults, shared capacity across clones, invalid configuration without filesystem changes, and progress for reads and another document while one document has 128 mutations awaiting its ordering lock.
Existing buffered fairness, cancellation, recovery, and ownership tests remain in place.
The contention test verifies that waiting for document order does not consume worker capacity; it does not establish a wall-clock fairness bound during slow filesystem calls.

### Production Confirmation

Three fresh service samples used the production implementation without a diagnostic environment override.
The source was `17fa9959140b8a5c59aafda625f27745cb615431` plus the worker-policy patch retained in the manifest.
This is a later base than the isolated `332ba4a1ac8` experiment, so these runs confirm the updated service rather than provide another exact single-change comparison against that earlier commit.
The workload remained durable storage, 64-byte operations, 32 documents, eight service cores, four generator cores, three warmup seconds, and ten measured seconds at 1,000 offered operations/s.

| Run | Delivered operations/s | Worst-worker p95, ms | Service CPU, % | Passed | All acknowledgments completed |
| ---: | ---: | ---: | ---: | --- | --- |
| 1 | 999.1 | 13.65 | 123.53 | Yes | Yes |
| 2 | 998.8 | 12.98 | 123.59 | Yes | Yes |
| 3 | 999.3 | 13.18 | 123.94 | Yes | Yes |

All three samples had zero missing deliveries.
The tested throughput bottleneck is resolved, but maximum sustainable throughput was not measured for this implementation.
CPU consumption remains about 124% at this load; the earlier controlled experiment's remaining CPU overhead is not claimed to be fixed.

### Validation and Evidence

The file-backend suite passed all 48 tests, including the new worker-policy and contention tests.
Formatting, strict all-target/all-feature workspace Clippy, warning-free rustdoc, workspace build/tests, documentation checks, scoped repository policy, release builds, and the root `pnpm build:fast` passed.
The first root build failed on array formatting in the retained benchmark summary; formatting that generated summary resolved the failure and the root build then passed.
The full aggregate `./test.sh` was not rerun for this follow-up.

The [production confirmation evidence](worker-policy-confirmation.json.gz) retains the source revision and patch, binary and runner hashes, three sample results, and validation records, including the initial root-build failure and successful retry.
No diagnostic timing instrumentation or worker-count environment override was included in the production service.
