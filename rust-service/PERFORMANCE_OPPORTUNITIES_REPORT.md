# Sea Performance Opportunities

Measured: 2026-09-23.
Primary source revision: `240798434cf591f4db2366a1a3b6b6a7438bd015`.
Summary-harness revision: `22309cf9d169c4f7986b6ce1db184427269f9656`.
Status: refreshed investigation report; no new production optimization is included.

## Summary

The shared live-event cache is implemented, enabled by default, and materially changes the performance picture.
The current eight-core buffered-file thresholds are 44,000 small and 36,000 large operations/s, compared with 10,000 and 9,000 in the last cache-disabled overview refresh.
The improvement is consistent with the checkpoint-1 paired evidence, which measured approximately 44-50% lower service CPU for file-backed reader workloads.

The highest-priority current finding is not an optimization:
native WebTransport with 64-byte events failed exact drain in all ten runs at 12,000 operations/s and again in all ten controls at 10,000 operations/s.
The large-event WebTransport group passed 10/10 at 6,000 operations/s, and browser WebTransport passed all 40 relevant samples.
The small native failure must be diagnosed before using that path for optimization comparisons.

After that correctness work, the best low-contract-risk opportunity remains borrowed response serialization.
The protocol encoder still clones event payloads into owned wire values before serialization.
Removing those copies can simplify ownership at the encoding boundary and reduce memory traffic without changing APIs, wire bytes, acknowledgment semantics, or persistence.

The largest potential throughput opportunity remains explicit durable submission concurrency.
The current end-to-end durable path reaches 5,000 small and 4,000 large operations/s at eight cores, while the earlier isolated storage pipeline reached approximately 50,000 and 20,000 operations/s with a 128-operation window.
Realizing that gap requires a batch or bounded outstanding-submission contract and therefore needs a product decision before implementation.

## Current Measurements

The refreshed [project overview](historical/PROJECT_OVERVIEW.md) and [retained dataset](historical/measurements/overview-refresh-20260923/README.md) are the source of truth for current numbers.
All file-backed service data used fresh owned directories on `/tmp`, ext4 on `/dev/sda1[/containerTmp]`.
The host reported AMD EPYC 9V74, 32 logical CPUs, Linux `6.8.0-1064-azure`, Rust `1.98.1`, and Node.js `22.23.2`.

### Eight-Core Capacity

Highest observed pass / higher observed failure:

| Backend | 64-byte payload | 8,192-byte payload |
| --- | ---: | ---: |
| Memory | 68,000 / 72,000 | 28,000 / 30,000 |
| Buffered file | 44,000 / 48,000 | 36,000 / 38,000 |
| Durable file | 5,000 / 6,000 | 4,000 / 6,000 |

These are short thresholds, not steady-state maxima.
Some higher failures ended on exact drain or the 4 GiB memory guard rather than a clean latency threshold.

### Matched Load

At 500 operations/s over 32 documents, all ten samples per payload passed:

| Payload | CPU median | Mean RSS median | Worst-worker p95 median |
| --- | ---: | ---: | ---: |
| 64 bytes | 8.65% | 39.94 MiB | 0.46 ms |
| 8,192 bytes | 12.14% | 72.56 MiB | 0.63 ms |

The service is inexpensive at this load.
Optimization should target capacity, historical replay, or durable latency rather than adding complexity to improve the matched-load row.

### Browser Application Throughput

All 160 browser samples passed.
Sea local-direct improved to medians of 13,532 dummy-DDS edits/s and 2,276 SharedTree edits/s.
The Fluid-integrated Sea local path reached 2,558 and 1,319 edits/s.
Tinylicious reached 4,011 and 1,694 edits/s.

The gap between direct and Fluid-integrated paths remains much larger than the difference among service transports.
For application-level SharedTree benchmarks, Fluid runtime and DDS work therefore dominate enough that server micro-optimizations will have limited visible impact.

### Summary and Cold Load

At 4 MiB of pseudorandom hexadecimal values:

- buffered Sea full/incremental upload: 91.6 / 27.2 ms;
- Tinylicious full/incremental upload: 123.6 / 45.5 ms;
- buffered Sea full/incremental cold load: 256.5 / 269.3 ms;
- Tinylicious full/incremental cold load: 613.9 / 605.8 ms.

Sea summary upload and process-cold loading are already substantially faster in this bounded workload.
No immediate complexity-increasing optimization is justified by these results.
Historical catch-up remains worth measuring separately because the live cache intentionally does not serve it.

## Completed Opportunities

### Shared Live-Event Cache

The planned checkpoint-1 cache is complete and enabled by default.
It shares the sequencer-published event among caught-up sessions while retaining storage as the authority for recovery and catch-up.

The implementation report records:

- approximately 44-50% lower CPU for file-backed reader workloads;
- approximately 3-5% higher CPU in memory-backed controls;
- additional but accepted resident memory;
- unchanged publication and acknowledgment boundaries;
- passing reader and no-reader controls.

The refreshed buffered thresholds provide end-to-end confirmation that the cache removed the previous live file-reader bottleneck.
Do not propose another live-read cache layer.
Remaining file-reader work should target historical catch-up only.

### Generator Headroom

The stress harness now supports eight generator processes on separate physical CPUs.
Eight-core capacity cells use all eight, eliminating the known four-generator ceiling from the main Sea table.
Generator count and affinity are recorded in every result.

### Reproducible Temporary Storage

Sea and Tinylicious file data now use fresh owned `/tmp` directories on the same recorded mount.
Artifacts are stored separately, and owned data is removed after each sample.
This removes the previous workspace-versus-`/tmp` filesystem ambiguity.

## Ranked Remaining Work

### 1. Diagnose Native WebTransport Exact-Drain Failures

**Priority:** blocker.
**Expected performance impact:** none directly; required for trustworthy transport comparisons.
**Complexity:** diagnostic first.

Observed:

- 64-byte native WebTransport at 12,000 operations/s: 0/10 accepted;
- 64-byte native WebTransport at 10,000 operations/s: 0/10 accepted;
- 8,192-byte native WebTransport at 6,000 operations/s: 10/10 accepted;
- browser WebTransport groups: 40/40 accepted across both DDS modes and direct/Fluid paths.

The failed native workers report transport disconnects and missing final events after otherwise near-complete delivery.
Because reducing rate did not help, do not classify this as simple saturation.

Next measurement:

1. Reproduce with one document and then 4, 8, 16, and 32 documents.
2. Record the last acknowledged, writer-delivered, and observer-delivered positions.
3. Distinguish connection close initiated by client, server, idle timeout, or stream failure.
4. Compare explicit post-drain close with the current worker shutdown sequence.
5. Add a focused regression only after the failing lifecycle boundary is identified.

Avoid weakening exact-drain assertions or adding retries that turn missing events into a success-shaped result.

### 2. Remove Owned Event-Payload Copies During Encoding

**Priority:** highest non-breaking optimization.
**Expected impact:** low-to-moderate CPU and allocation reduction, greatest for large payloads and fanout.
**Complexity:** potentially neutral or lower if borrowing remains local to serialization.

The response encoder still constructs owned protocol values:

- the core event payload is converted to an owned vector;
- the protocol event is cloned into the serialization helper;
- serialization allocates the final frame;
- transports may perform another framing or write copy.

Use serialization-only borrowed wire structures so the encoder reads the existing event payload directly.
Keep public protocol types and encoded bytes unchanged.
Do not introduce lifetime parameters across the service API merely to avoid a local copy.

Validation:

- byte-for-byte encoding equality for every response variant;
- 64-byte control at 24,000 WebSocket operations/s;
- 8,192-byte WebSocket cells at 12,000 and 28,000 operations/s;
- one and two recipients per document;
- CPU, allocation count if available, RSS, and threshold outcome.

The old arithmetic estimate of approximately 1.16 GiB/s of avoidable copying at 38,000 large operations/s is no longer the current accepted throughput.
At the current 28,000 large memory pass, two recipients, and two avoidable payload copies, the corresponding upper-bound traffic is approximately 875 MiB/s.
That is memory-traffic arithmetic, not a predicted CPU saving.

### 3. Add Bounded File-Reader Prefetch for Historical Catch-Up

**Priority:** medium.
**Expected impact:** potentially meaningful for replay; little expected benefit for caught-up live readers.
**Complexity:** modest if confined to the existing blocking adapter with explicit item/byte bounds.

The file reader still dispatches one blocking read poll at a time with no background prefetch.
The live cache now bypasses that path for caught-up sessions, so the opportunity has narrowed to recovery and historical replay.

Allow one blocking turn to decode several immediately available events and return a bounded queue to the async side.
Do not retain a blocking worker while the source is pending.

Measure:

- replay of 4 Ki, 64 Ki, and 1 MiB histories;
- concurrent live writer latency;
- hot/cold document fairness;
- cancellation and shutdown;
- peak retained bytes;
- worker-dispatch count per replayed event.

Keep this only if it simplifies or cleanly encapsulates the current one-item adapter.
A second cache or unbounded read-ahead queue would be a net complexity increase and is not justified.

### 4. Expose Explicit Durable Submission Concurrency

**Priority:** potentially high impact, contract-sensitive.
**Expected impact:** large for durable throughput.
**Complexity:** unavoidable API and client-flow complexity.

Earlier isolated storage-pipeline measurements found:

- small durable events: approximately 1,090 operations/s at window 1 and 49,998 at window 128;
- large durable events: approximately 992 operations/s at window 1 and 20,149 at window 128.

The refreshed end-to-end eight-core passes are 5,000 and 4,000 operations/s.
The remaining gap indicates that synchronization can be shared across a group, but the current per-document client flow does not consistently supply enough concurrent work.

Possible additive contracts:

- batch submit with one ordered result per event;
- bounded submission stream with ordered receipts;
- client option allowing a fixed number of outstanding submissions.

Do not add an implicit batching delay or acknowledge before durable synchronization.
Measure windows 1, 4, 16, 64, and 128 per document, including batch-size distribution, synchronization count, p50/p95 acknowledgment latency, and shutdown integrity.

This work requires user approval before implementation because it changes how callers submit and observe operation completion.

### 5. Bound Large-Payload Retention Before Chasing Higher Memory Throughput

**Priority:** medium for robustness; not a pure throughput optimization.
**Expected impact:** prevents guard-bound failures and makes capacity interpretation clearer.
**Complexity:** policy-sensitive.

The eight-core 8,192-byte memory path passes 28,000 operations/s and fails at 30,000 when a worker exits before producing a result.
Earlier runs established that retained history can approach the 4 GiB service guard.
The memory backend intentionally retains history, so this is not automatically a leak or CPU ceiling.

Before optimizing this cell, decide whether production memory storage should:

- remain intentionally unbounded;
- enforce a byte/item cap;
- spill old history;
- disconnect lagging readers;
- expose a caller-managed retention policy.

Do not silently truncate history or reinterpret a guard termination as a throughput result.

## Changes Requiring Approval

Ask before implementing:

- any durable batch or bounded-concurrency API;
- implicit acknowledgment delay;
- changes to durable synchronization or power-loss guarantees;
- lagging-reader disconnection or shedding;
- cache-retention policy changes;
- memory-history caps or truncation;
- removal of writer echo;
- observer-delivery semantic changes.

The borrowed serializer and bounded historical-read prefetch can be prototyped without changing external behavior if their implementation remains local and encoded bytes stay identical.

## Recommended Order

1. Diagnose and fix the native WebTransport exact-drain regression.
2. Implement and measure borrowed response serialization.
3. Measure historical replay; add bounded file-reader prefetch only if dispatch remains material.
4. Decide whether durable callers can adopt an explicit batch or bounded outstanding-submission contract.
5. Decide the memory backend's retention policy before treating guard-bound large-payload results as an optimization target.

This order restores measurement validity first, then tries the lowest-contract-risk simplification.
It defers API, acknowledgment, and retention changes until their use-case effects are explicitly accepted.
