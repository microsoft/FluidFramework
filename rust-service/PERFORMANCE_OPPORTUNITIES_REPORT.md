# Sea Performance Opportunities

Measured: 2026-09-23.
Source revision: `c41a02a33d5ec09f737b912e6b60d0eae1f88ecb`.
Status: investigation report; no production optimization is included.

## Summary

The benchmark results contain three different limits.
They must be treated separately:

1. The four-core native generator limits the reported memory thresholds.
   With eight generator cores, the previous 76,000 small-event and 38,000 large-event failures both passed three of three runs.
2. Live file delivery is expensive even when append is fast.
   Each writer and observer reads the same newly published event through an independent storage stream and file-worker dispatch.
3. Durable throughput is primarily a concurrency and acknowledgment-contract problem.
   One in-flight submission per document gives approximately 1,000 durable operations/s locally, while a window of 128 gives 20,000-50,000 operations/s.

The branch's active [live-read cache and session policy plan](SESSION_RESOURCE_POLICY_PLAN.md) already makes a shared live-read cache for caught-up readers its checkpoint-1 deliverable.
Checkpoint 0 selected the ownership and revocation contract and froze the comparison baseline; it did not implement the Rust cache.
The fresh measurements in this report strengthen the reason to execute that existing checkpoint next.
The cache should preserve storage as the authority for recovery and catch-up.
Existing controlled diagnostics suggest a 15-30% service CPU reduction is plausible for the current buffered writer-and-observer workload, but this estimate is not a measured cache result.

The simplest independent improvement is to remove two full payload copies from event response encoding.
This does not require an application programming interface (API), protocol, persistence, or acknowledgment change.
It needs a focused benchmark before any impact is claimed.

The benchmark harness should use enough generator cores to keep service measurements load-generator independent.
This changes benchmark resource allocation, not production behavior.

## Scope And Evidence

This investigation covers the 32-document stress workload used by the [project overview](historical/PROJECT_OVERVIEW.md):

- one writer and one observer per document;
- one ordered submission queue per document;
- native WebSocket transport for throughput tests;
- eight service cores;
- memory, buffered-file, and durable-file storage;
- 64-byte and 8,192-byte application payloads.

The following evidence classes are used:

- **Measured here:** fresh runs from this revision.
- **Measured previously:** retained controlled evidence from the linked historical reports.
- **Inferred:** a conclusion from code structure and measured bounds.
- **Speculative:** an unmeasured candidate with an explicit validation step.

Fresh tests ran on the same shared AMD EPYC 7763 host as the table refresh.
The host was not isolated from all unrelated activity.
Threshold tests used three warmup seconds and ten measured seconds.
Short recipient-count diagnostics used one warmup second and three measured seconds.

`perf` and FlameGraph tools were unavailable.
System-call traces used `strace`; traced timings are not throughput results because tracing materially changes execution time.

## Current Work Per Submitted Event

The stress workload performs the following work for each application event:

1. The generator creates and submits one payload.
2. The sequencer validates the author reference and admits the event.
3. Storage publishes or durably commits the event, depending on the backend.
4. The writer's event stream reads and sends the event.
5. The observer's event stream independently reads and sends the same event.
6. Both clients recreate the expected payload and compare it.
7. The observer delivery contributes to reported throughput and latency.

For file storage, steps 4 and 5 each use a separate lazy archive stream.
Each source poll is dispatched through the bounded blocking-worker adapter with no prefetch.
Caught-up readers therefore pay filesystem-reader and cross-thread scheduling costs for data that was just published in the same process.

The server also creates a new protocol event for each recipient.
For the common event-without-blob path, it:

1. copies the core `Bytes` payload into a protocol `Vec<u8>`;
2. clones that vector into the serialization helper;
3. serializes into a new frame vector; and
4. copies each frame chunk into a WebSocket record vector.

The first two payload copies can be removed with borrowed serialization.
Sharing an encoded live frame between recipients could remove more repeated work, but it would require a carefully placed transport-level cache.

## Fresh Measurements

### Intrinsic Storage And Sequencer Ceiling

The local `storage-pipeline` benchmark ran twice for every backend, payload, and in-flight window.
Values are the median of two measured phases with 4,096 operations each.
They include final drain and ordered replay verification.

| Backend | Payload bytes | In-flight window | Operations/s | Submit p95, us | Replay 4,096 events, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Memory | 64 | 1 | 304,386 | 5.4 | 1.16 |
| Memory | 64 | 128 | 288,787 | 494.4 | 1.16 |
| Memory | 8,192 | 1 | 112,921 | 15.8 | 4.46 |
| Memory | 8,192 | 128 | 109,816 | 1,339.6 | 4.29 |
| Buffered file | 64 | 1 | 147,085 | 19.2 | 198.21 |
| Buffered file | 64 | 128 | 117,155 | 1,318.4 | 214.27 |
| Buffered file | 8,192 | 1 | 49,499 | 19.9 | 307.48 |
| Buffered file | 8,192 | 128 | 47,279 | 4,432.3 | 278.91 |
| Durable file | 64 | 1 | 1,090 | 1,097.0 | 180.78 |
| Durable file | 64 | 128 | 49,998 | 3,330.8 | 194.26 |
| Durable file | 8,192 | 1 | 992 | 1,200.0 | 284.44 |
| Durable file | 8,192 | 128 | 20,149 | 7,950.1 | 264.03 |

The refreshed end-to-end buffered thresholds are only 10,000 small and 9,000 large operations/s.
Local buffered admission is approximately 15 times the small end-to-end threshold and five times the large threshold.
Append capacity is therefore not the primary buffered limit.

The durable window result is different.
Window 128 is approximately 46 times faster than window 1 for small payloads and 20 times faster for large payloads.
The current stress client serializes submissions per document, so it cannot form large same-document durable batches.

### One Recipient Versus Two

A temporary benchmark-only option selected one or two active event recipients per document.
The second session was still opened in both variants.
Only its event read and delivery were omitted in the one-recipient variant.
Production source and benchmark binaries were restored after collection.

Both variants offered 2,000 buffered small operations/s over 32 documents.
Values are medians of three alternating runs.

| Active recipients per document | Threshold passes | Delivered operations/s | Service CPU, % | Mean RSS, MiB | Worst-worker p95, ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3/3 | 2,000.3 | 131.47 | 28.06 | 0.659 |
| 2 | 2/3 | 1,999.3 | 190.25 | 46.07 | 0.990 |

The two-recipient p95 median is one of the two normal-latency runs.
The remaining run delivered the offered load but had 125.9-133.9 ms worker p95 values and failed the 100 ms threshold.

Removing the second active read and response path reduced median service CPU by 30.9% and mean resident set size (RSS) by 18.01 MiB.
This is not a prediction that a cache will remove 30.9% CPU.
A cache retains the second response serialization and network write.
The result establishes that per-recipient work is a large part of this buffered workload.

### Generator Ceiling

The retained table-refresh campaign used four single-thread generator processes.
At the 68,000 small-event pass they used approximately 370% aggregate generator CPU.
At the 76,000 failure they reported approximately 448%, which indicates saturation and sampling across drain boundaries.
The service used 618-661% of its eight assigned cores in those two runs.

A temporary one-line runner diagnostic increased the generator count from four to eight and assigned eight physical cores.
No server, client protocol, storage, or workload correctness behavior changed.
Production benchmark source was restored after collection.

| Payload bytes | Offered operations/s | Passes | Delivered median | Service CPU median, % | Generator CPU median, % | Worst-worker p95 median, ms | Service peak RSS median, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 | 76,000 | 3/3 | 75,983.6 | 672.19 | 468.6 | 3.411 | 319.25 |
| 8,192 | 38,000 | 3/3 | 37,996.5 | 619.27 | 481.6 | 3.174 | 4,009.32 |
| 64 | 88,000 | 0/3 | 87,986.5 | 747.38 | 576.5 | 272.378 | 362.61 |

At 88,000 small operations/s, all runs delivered essentially the full load and drained with no missing events or final errors.
They failed only the latency criterion.
Worst-worker p95 values ranged from 208 to 284 ms.
The service's small-event sustainable bracket with adequate generation is therefore 76,000 pass / 88,000 fail.

The 38,000 large-event run peaks at 4,009 MiB, close to the harness's 4 GiB service limit.
The memory backend retains the full event history.
The next capacity step is therefore likely to reach the history-memory limit before it exhausts service CPU.

### System-Call Trace

One traced 64-byte/window-128 local run was collected for each backend.
The file-backed runs each verified 4,096 measured events plus warmup.

| Backend | `read` | `write` | `lseek` | `fsync` | `futex` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Memory | 23 | 2 | 0 | 0 | 1 |
| Buffered file | 46,475 | 4,584 | 29,657 | 0 | 19,872 |
| Durable file | 46,475 | 4,562 | 29,708 | 260 | 18,682 |

Most file reads and seeks occur during verified replay.
The equal read counts show that replay, not durable synchronization, dominates the file-reader call count.
Buffered storage performs no `fsync`.
The durable trace made 260 `fsync` calls while processing 4,224 warmup-plus-measured events in this window-128 run.

Tracing increased buffered replay from approximately 0.21 seconds to 4.72 seconds.
Only call counts and relative path shape are used here.

## Previous Controlled Evidence

### File Read Dispatch

The [file execution investigation](historical/measurements/file-execution-e2e-20260922/README.md#read-poll-cpu-investigation) compared normal per-poll offloading with diagnostic inline reads at 1,000 buffered small operations/s.

| Read mode | Passes | Service CPU, % | Worst-worker p95, ms |
| --- | ---: | ---: | ---: |
| Per-poll worker offload | 2/3 | 125.62 | 12.39 |
| Diagnostic inline reads | 3/3 | 90.70 | 11.64 |

Inline reads reduced service CPU by approximately 28% in every pair.
They are not safe production behavior because synchronous file input/output can block async executor threads.
The result localizes cost to the worker-dispatched file-read path and motivates removing live file reads, not moving them inline.

The same investigation counted 45,056 source polls and approximately 15,060 pending results.
A diagnostic wake gate skipped zero polls and did not improve CPU.
Unnecessary parent repolling is eliminated as the cause.

### Sequencer Ready Path

The [storage optimization investigation](historical/STORAGE_OPTIMIZATION.md#focused-overhead-pass-on-the-merged-baseline) removed channel, shared-driver, and batch-vector setup when an idle append completes immediately.
Local memory throughput improved by 8-57%, depending on payload and window.
File-backed results were mostly within a few percent.

This change is already present.
It shows that sequencer allocation and coordination can matter for memory storage, but it also removed the largest known simple ready-path overhead.
Further pipeline work should be profiled before another structural change.

### Message Framing

The protocol now uses `length | kind | payload`.
Controlled alternating tests found no reproducible throughput improvement over kind-first framing.
Steady-state reads were already buffered.
Framing order is eliminated as a material performance opportunity.

## Ranked Opportunities

| Rank | Opportunity | Expected impact | Confidence | Complexity change | Contract effect |
| ---: | --- | --- | --- | --- | --- |
| 1 | Use enough generator processes for capacity tests | Measured: 76k and 38k former failures became 3/3 passes | High | Small harness increase | Benchmark resource contract only |
| 2 | Execute the existing checkpoint-1 shared cache for caught-up live events | Estimated 15-30% buffered service CPU; possible 1.2-1.5x capacity | Medium | Neutral if it replaces repeated live storage reads; higher if policy is coupled | Checkpoint 0 already selected the cache ownership and neutral revocation contract |
| 3 | Borrow payloads during response serialization | Remove two full payload copies per recipient | High that copies are removed; impact unmeasured | Net simplification | None |
| 4 | Share encoded live frames between recipients | Avoid repeated serialization for the second and later readers | Medium | Moderate increase unless combined with the live cache | Per-connection limits and error accounting must remain correct |
| 5 | Add bounded file-read prefetch or multi-item worker turns | Reduce worker dispatches during catch-up and replay | Medium | Moderate increase | Preserve lazy reads, fairness, cancellation, and memory bounds |
| 6 | Expose bounded durable concurrency or batch submission | Local evidence allows multi-fold gains, up to 20-46x in the synthetic window comparison | High for local storage; medium end-to-end | API increase, possibly simpler than implicit concurrency | Receipt timing, ordering, and backpressure become explicit |
| 7 | Profile remaining sequencer clones and lock transitions | Estimated 5-15% memory CPU if a clear redundant step is found | Low-medium | Must be neutral or lower | None if ownership and receipts remain unchanged |

Expected impacts are targets for experiments, not commitments.

## Recommended Designs And Tests

### 1. Fix The Measurement Boundary First

Add an explicit generator-process count to the stress-run configuration.
Do not silently change the historical default.
For capacity searches, require generator CPU headroom and report aggregate generator CPU beside service CPU.

Use eight generators for the current eight-service-core native capacity table.
Retain four-generator cells when comparison with historical data is required.
Mark any threshold as generator-limited when generator utilization is close to its assigned capacity.

For memory large-event capacity, either:

- shorten the run while preserving a stable measured interval;
- add a bounded-retention memory backend used only for throughput diagnosis; or
- report the 4 GiB history limit as the tested bound.

Do not describe a retained-history failure as a CPU throughput limit.

### 2. Execute The Existing Checkpoint-1 Cache Experiment

The [staged plan](SESSION_RESOURCE_POLICY_PLAN.md) and its [implementation report](SESSION_RESOURCE_POLICY_IMPLEMENTATION_REPORT.md) already define this experiment.
Checkpoint 0 is complete and committed.
Checkpoint 1 remains not started and requires separate authorization under that plan.

Implement the planned canonical shared published-event representation near the sequencer publication boundary.
Keep storage-backed reads for recovery and historical catch-up.
Serve only readers that are caught up from the shared representation.

Checkpoint 1 should not add writer admission policy, reference-floor coupling, tenant policy, or transport scheduling.
Measure those concerns separately as required by the staged plan.

The experiment must preserve:

- publication only after the backend's existing acknowledgment boundary;
- ordered application and membership events;
- coherent transition between storage catch-up and live delivery;
- buffered write-behind failure propagation;
- cancellation and shutdown;
- direct and managed reader behavior.

Compare current and candidate builds in alternating order at:

- buffered 64 bytes at 2,000, 10,000, and the next higher bracket;
- buffered 8,192 bytes at 2,000, 9,000, and the next higher bracket;
- memory controls at matched loads;
- one, two, and at least eight live recipients per document.

Record event-cache hits, storage fallbacks, worker-dispatched read polls, retained bytes, service CPU, RSS, and latency.

### 3. Remove Borrowable Payload Copies

Add serialization-only borrowed wire structures for event responses.
Serialize directly from the core event payload instead of converting `Bytes` to an owned protocol vector and cloning it into another owned wire value.

At 38,000 operations/s, two recipients, and 8,192-byte payloads, the two avoidable copies account for approximately 1.16 GiB/s of memory copying:

`38,000 * 2 recipients * 8,192 bytes * 2 copies`.

This arithmetic is not a CPU-impact estimate.
Serialization and socket writes still need to copy or retain bytes according to their APIs.

Validate exact encoded-byte compatibility for every response variant.
Measure memory 8,192-byte cells at 30,000 and 38,000 operations/s, plus a 64-byte control.
Keep the change only if CPU or capacity improves without making the protocol types harder to maintain.

### 4. Batch File Reader Work, Not Async-Executor Blocking

For storage catch-up, let one worker turn read and decode multiple immediately available events up to explicit item and byte limits.
Return a small bounded queue to the async side.
Do not keep a worker while the source is pending.

This can amortize semaphore, blocking-pool, wake, and cross-thread scheduling costs.
It is less useful for a caught-up reader that receives one event at a time, which is why the live cache ranks higher.

Validate replay time, concurrent writer latency, hot/cold document fairness, cancellation, and peak retained bytes.

### 5. Make Durable Grouping Explicit

The current durable guarantee does not need to be weakened to gain from grouping.
The service can acknowledge every operation only after a shared journal write and synchronization complete.
The missing input is enough same-document concurrency to form a group.

Consider one of these interfaces only after confirming the required use cases:

- an additive batch-submit request with one ordered result per event;
- a bounded stream of submissions and ordered receipts;
- a client option that permits a fixed number of outstanding submissions.

Do not add an implicit batching delay until its latency objective is agreed.
Do not acknowledge before synchronization under the durable mode; that behavior already exists as buffered storage.

Measure end-to-end durable throughput at windows 1, 4, 16, 64, and 128 per document.
Report batch-size distribution and `fsync` count.
The local 20-46x difference is an upper bound on opportunity, not an end-to-end forecast.

## Changes That Need A Decision Before Implementation

The following changes can affect existing use cases and should not proceed as part of a performance cleanup without approval:

- disconnecting or shedding lagging readers;
- changing how a slow reader affects cache retention;
- coupling cache reclamation to the writer reference floor;
- changing durable acknowledgment or power-loss guarantees;
- adding implicit durable batching delay;
- changing per-operation receipt timing or ordering;
- removing writer echo;
- changing observer delivery semantics;
- bounding or truncating the production memory backend's retained history.

Checkpoint 0 already made the ownership and neutral revocation decision for the minimal cache experiment.
Starting checkpoint 1 still requires the separate authorization required by the staged plan.
Turning the experiment into a bounded production guarantee requires the later lag-policy checkpoints and their decisions.

## Recommended Order

1. Make generator count explicit and rerun the memory capacity table with generator headroom.
2. Authorize and execute the existing checkpoint-1 shared-live-read experiment against its frozen baseline.
3. If the cache wins, continue the staged plan and keep bounded retention and lag behavior in their later checkpoints.
4. Implement and measure borrowed event serialization as a separate optimization so it does not contaminate the cache comparison.
5. Add bounded multi-item file reads for historical catch-up if replay remains important.
6. Decide whether durable callers can use bounded concurrency or a batch API.
7. Profile the remaining sequencer path only after the larger delivery costs are removed.

This order starts with measurement correctness and non-breaking simplifications.
It defers policy and acknowledgment changes until their value and use-case effect are clear.
