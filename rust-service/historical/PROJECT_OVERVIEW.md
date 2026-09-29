# Sea: Project Overview

Current implementation and measurements, September 29, 2026.
The [refresh dataset](measurements/default-policy-refresh-20260929/README.md) identifies the measured source, binaries, configurations, results, and unsuccessful attempts.
For setup and contracts, see the [project README](../README.md) and [architecture guide](../SEA_ARCHITECTURE.md).

Sea (Snapshotted Event Archive) is an experimental Rust service for ordered application events, immutable blob trees, and snapshots.
Applications own event meaning and snapshot content; the service owns ordering and publication authority.
Fluid integration is optional.
This is a single-host experiment, not a production replacement for an existing Fluid service.

## Architecture and Defaults

Typed per-document session factories support embedded clients and transport adapters.
Session decorators implement document-wide admission and reader-shedding policy outside the sequencer.
The sequencer orders writes, waits for storage completion, and publishes committed events to live readers.
Storage remains authoritative for recovery and historical reads; a shared live cache serves caught-up readers.

The server executable defaults to:

- Durable-file storage, with memory and buffered-file alternatives.
- Live caching and the resource policy enabled.
- At most 256 outstanding author requests per stream, also limited to 4 MiB of encoded input charges.
  One additional lookahead request and framing storage are outside those charges.
- Storage-pressure waiting for durable writes and shedding of lagging live readers above soft cache targets of 1,024 entries or 8 MiB of canonical payload.
  Above either target, the policy also refuses new sessions and live readers.

These are not hard total-memory limits.
The memory backend retains archive history regardless of reader shedding; transport buffers and already-dequeued values are separate.
An explicit `SEA_EXPERIMENTAL_RESOURCE_POLICY=false` disables the policy.
Disabling live caching or selecting the pass-through factory experiment requires that opt-out.
Embedded hosts still select decorators explicitly.
The [server guide](../crates/sea-webtransport-server/README.md) defines the remaining budgets, configuration checks, and failure semantics.

## Measurement Method

**Sea supports transport-backpressured streaming; the tested Tinylicious driver needs a benchmark-side workaround.**
Sea's streamed generator submits individual frames and awaits WebTransport write capacity, without waiting for each application acknowledgement.
Tinylicious's Socket.IO driver exposes synchronous `submit()` without awaitable write capacity.
Its pipelined generator instead replenishes a bounded outstanding-operation window from validated sequenced writer echoes.
This is application-level credit control, not transport backpressure or a durable acknowledgement; it does not mean TCP itself lacks flow control.

Both approaches keep work available without searching offered rates for a failure threshold.
They measure different stacks and admission mechanisms, not language-only performance.
The Tinylicious workaround passed all 12 primary samples, so no paced fallback was needed.
A separate matched-load test still measures resource efficiency and latency.

Unless stated otherwise:

- Stress runs use 32 documents, one writer and two read subscriptions per document, two seconds warmup, and 12 measured seconds.
- Each configuration has three fresh runs, with ascending, reversed, and rotated configuration order.
  Tables give medians; per-run values and observed ranges are in the dataset.
- Saturation runs use eight separate generator cores.
  Tinylicious permits at most 256 outstanding operations and 2 MiB of logical payload per generator, for 2,048 operations across eight generators.
- Sea uses the new defaults, with `SEA_MAX_CONNECTIONS=128` as an explicit benchmark override.
  No storage scheduler, batching, or QUIC-window tuning is applied.
- Write rates count Sea application acknowledgements or Tinylicious sequenced writer echoes received in the measurement interval.
  Read rates count actual application-event deliveries to both subscriptions, not an inferred multiple of writes.
- Exact final acknowledgement, payload/order, and non-shed-reader drain checks determine validity.
  Explicit reader revocation is reported separately; it is not silently treated as complete fanout.
- The drain allowance is 120 seconds for Sea streaming and 30 seconds for Tinylicious pipelining.
  Drain completions do not increase in-window throughput.
  Existing memory, timing-record, and timeout safety guards remain enabled.

All file-backed data used fresh owned directories directly under `/tmp`, on ext4 `/dev/sda1[/containerTmp]`.
The host reported AMD EPYC 7763, 32 logical CPUs, Linux `6.8.0-1064-azure`, Node.js `22.23.2`, and Rust `1.98.1`.
Service cores are selected from `0,2,...,14`; generator cores from `16,18,...,30`.
No builds or test suites ran concurrently with timed samples.
Older measurements from before the host reboot are not pooled into these results.

## Saturated Throughput

Eight service cores.
Each row reports three attempts, including unsuccessful ones.
The rates below are medians of completed samples; the main table contains only groups where all three completed.
Memory figures are whole-service RSS, not queue sizes.
Tinylicious LevelDB does not provide durability-equivalent acknowledgements to Sea durable-file in this configuration.

| Backend | Payload | Writes/s | Read deliveries/s | Mean / peak RSS, MiB | Readers shed, each run |
| --- | ---: | ---: | ---: | ---: | --- |
| Sea memory | 64 B | 279,253 | 550,907 | 676.9 / 1,302.7 | 4, 0, 0 |
| Sea buffered-file | 64 B | 147,630 | 295,101 | 84.8 / 92.7 | 0, 0, 0 |
| Sea durable-file | 64 B | 306,611 | 613,175 | 117.0 / 118.6 | 0, 0, 0 |
| Tinylicious memory | 64 B | 2,998 | 5,996 | 329.5 / 389.1 | None |
| Tinylicious LevelDB | 64 B | 5,457 | 10,949 | 497.5 / 673.9 | None |
| Sea memory | 1 KiB | 221,081 | 442,159 | 2,276.6 / 4,009.2 | 0, 0, 0 |
| Sea buffered-file | 1 KiB | 152,185 | 298,895 | 52.3 / 52.3 | 0, 1, 0 |
| Sea durable-file | 1 KiB | 155,536 | 311,173 | 150.9 / 161.6 | 0, 0, 0 |
| Sea buffered-file | 4 KiB | 74,916 | 149,829 | 47.0 / 47.1 | 0, 0, 0 |
| Sea durable-file | 4 KiB | 76,278 | 152,524 | 136.1 / 144.7 | 0, 0, 0 |
| Sea buffered-file | 8 KiB | 45,394 | 90,789 | 49.0 / 49.0 | 0, 0, 0 |
| Sea durable-file | 8 KiB | 48,809 | 97,599 | 158.5 / 167.5 | 0, 0, 0 |
| Tinylicious memory | 8 KiB | 1,560 | 3,120 | 575.2 / 761.9 | None |
| Tinylicious LevelDB | 8 KiB | 1,384 | 2,768 | 623.1 / 905.8 | None |

The fastest 64-byte Sea memory sample shed four of 64 readers: it completed 283,777 writes/s but only 532,776 read deliveries/s.
The two zero-shedding samples completed 275,456–279,253 writes/s and 550,907–558,507 read deliveries/s.
Higher write throughput with less reader work is not higher equal-fanout capacity.
Durable storage can benefit from the existing queued batching path; these measurements do not imply a general ordering of backend speed.

### Resource Guards and Short Memory Runs

All six eight-core memory attempts at 4 and 8 KiB hit the benchmark's **4 GiB sampled RSS guard**.
They are failed samples, not throughput results.
Shedding readers cannot reclaim the memory backend's retained archive history.
In the shorter runs below, acknowledged payload alone accounts for approximately 93–94% of peak RSS.
This supports expected document-history growth as the explanation for the guard, rather than an unexplained leak; it is not a heap-profile proof that no leak exists.

Separate follow-ups shortened the workload to one second warmup and four measured seconds without changing the guard.
All six passed with zero shedding:

| Payload | Writes/s | Read deliveries/s | Peak RSS, MiB |
| --- | ---: | ---: | ---: |
| 4 KiB | 101,919 | 203,850 | 2,165.2 |
| 8 KiB | 59,747 | 119,496 | 2,537.0 |

These are short-run rates, not evidence of sustainable memory use.
They are not pooled with the 12-second results or used as matched-duration memory comparisons.

### Core Scaling and Overload Failures

Sea WebTransport; each cell gives **64-byte / 8-KiB write operations/s**.
Values require three completed runs; `incomplete` means the group did not meet that condition.

| Service cores | Memory | Buffered-file | Durable-file |
| ---: | ---: | ---: | ---: |
| 1 | 20,904 / 8,154 | 8,936 / 4,667 | 45,356 / 2,798 |
| 4 | incomplete / 30,896 | incomplete / 19,611 | 171,649 / 21,587 |
| 8 | 279,253 / RSS guard | 147,630 / 45,394 | 306,611 / 48,809 |

One-core, 64-byte durable runs shed 32, 32, and 31 readers; median read throughput was 46,443 deliveries/s.
The corresponding write rate is not an all-readers capacity result.
One-core, 64-byte memory and buffered runs retained all readers but needed median maximum-worker drains of 27.3 and 58.5 seconds.
Backpressure does not eliminate already-buffered work.

Four-core, 64-byte memory completed only one of three runs; buffered-file completed two of three.
The failed memory runs recorded an unexpected stream/receipt termination and a timing-record-limit failure.
The failed buffered run recorded a lost connection.
All three failed the acknowledgement-drain check; they are retained, not retried away or counted as successful throughput.
The underlying causes of the connection failures are not established by this campaign.

## Matched-Load Efficiency

500 offered operations/s, four service cores and four generator cores.
Sea uses its production Node/WASM WebSocket client and memory storage; Tinylicious uses Socket.IO, its in-memory database, and filesystem Git summaries.
All 12 samples met the offered-rate, latency, scheduling, and exact-drain gates.
RSS is the median of run means; latency is the median of each run's worst-worker p95, not a pooled p95.
CPU 100% means one occupied logical core.

| Payload | Service | Mean RSS, MiB | CPU, % | Worst-worker p95, ms |
| --- | --- | ---: | ---: | ---: |
| 64 B | Sea | 41.88 | 9.09 | 0.50 |
| 64 B | Tinylicious | 168.38 | 37.53 | 2.02 |
| 8 KiB | Sea | 74.43 | 12.75 | 0.66 |
| 8 KiB | Tinylicious | 223.45 | 48.51 | 3.02 |

### Acknowledgement-Paced Native Transports

Sea memory, four service cores and four native generator cores, one outstanding write per document.
All 12 samples passed without shedding.
These are round-trip-sensitive workloads, not the saturated streaming results above.
WebTransport includes QUIC/TLS; loopback WebSocket is unencrypted.

| Transport | Payload | Writes/s | Read deliveries/s | Worst-worker acknowledgement p95, ms |
| --- | ---: | ---: | ---: | ---: |
| WebSocket | 64 B | 45,426 | 90,851 | 1.07 |
| WebTransport | 64 B | 67,720 | 135,439 | 0.64 |
| WebSocket | 8 KiB | 28,544 | 57,088 | 1.71 |
| WebTransport | 8 KiB | 26,634 | 53,269 | 1.50 |

## Browser Application Performance

Three repetitions per path and DDS mode; 100 warmup edits and 1,000 measured scalar edits, one edit per turn, no per-turn convergence wait, then exact final convergence.
All 48 samples passed.
Values are median edits/s.
Browser and service processes share CPUs `8,10,12,14,16,18,20,22`.

| Path | Dummy DDS | Real SharedTree |
| --- | ---: | ---: |
| Sea local direct | 13,928 | 2,328 |
| Sea local Fluid | 2,526 | 1,324 |
| TypeScript local | 924 | 693 |
| Sea WebTransport, Fluid | 1,474 | 971 |
| Sea WebTransport, direct | 3,336 | 1,506 |
| Sea WebSocketStream, Fluid | 1,166 | 826 |
| Sea WebSocketStream, direct | 2,463 | 1,194 |
| Tinylicious | 4,036 | 1,713 |

Sea uses memory storage; the TypeScript local service uses browser `sessionStorage`.
Tinylicious uses an in-memory database and filesystem Git summaries.
Remote Sea services use the default resource policy; local direct/embedded paths do not implicitly acquire that decorator.
Direct paths omit Fluid runtime responsibilities and are not equivalent Fluid drivers.

## Summaries and Process-Cold Loads

Eight SharedMaps contain 32 or 512 values of 1,024 bytes each: 256 KiB or 4 MiB of application values.
Three independent documents per backend, size, entropy, and full/incremental mode produced 72 passing samples.
Every sample verified the snapshot fingerprint, map contents, and 200 persisted tail operations.
Services use CPUs `2,4,6,8`; clients use `10,12`.

Each cell gives **full / incremental** median milliseconds.
Upload measures the storage call; download reads every unique blob with fanout eight in a fresh process.
Cold load starts a fresh service and client, but does not clear the OS page cache.

| Values | Content | Backend | Upload | Complete download | Cold load |
| --- | --- | --- | ---: | ---: | ---: |
| 256 KiB | Pseudorandom hex | Sea buffered | 19.8 / 11.8 | 121.5 / 117.5 | 173.6 / 179.0 |
| 256 KiB | Pseudorandom hex | Sea durable | 26.1 / 16.6 | 120.5 / 121.5 | 177.4 / 180.5 |
| 256 KiB | Pseudorandom hex | Tinylicious LevelDB | 48.6 / 35.0 | 153.2 / 162.2 | 239.5 / 246.2 |
| 256 KiB | Repeated text | Sea buffered | 19.8 / 11.8 | 123.0 / 121.5 | 181.3 / 173.9 |
| 256 KiB | Repeated text | Sea durable | 25.0 / 16.4 | 121.0 / 117.8 | 173.0 / 176.2 |
| 256 KiB | Repeated text | Tinylicious LevelDB | 48.5 / 37.3 | 149.1 / 146.5 | 223.6 / 230.3 |
| 4 MiB | Pseudorandom hex | Sea buffered | 95.5 / 26.0 | 210.6 / 212.0 | 263.4 / 273.7 |
| 4 MiB | Pseudorandom hex | Sea durable | 99.1 / 32.0 | 217.2 / 207.6 | 272.3 / 266.6 |
| 4 MiB | Pseudorandom hex | Tinylicious LevelDB | 122.9 / 46.6 | 517.5 / 523.0 | 591.3 / 628.0 |
| 4 MiB | Repeated text | Sea buffered | 92.4 / 23.5 | 214.7 / 209.6 | 269.4 / 270.9 |
| 4 MiB | Repeated text | Sea durable | 102.0 / 28.8 | 214.2 / 205.9 | 269.0 / 281.8 |
| 4 MiB | Repeated text | Tinylicious LevelDB | 120.8 / 46.2 | 515.7 / 478.8 | 552.8 / 547.5 |

### Persisted Size

Apparent bytes after attachment and the acknowledged update summary.
The following uses full-mode medians; the dataset also retains incremental results, operation growth, and allocated filesystem bytes.
Sea's initial journal includes document records and summary content.
Tinylicious's initial total includes LevelDB and filesystem Git storage.

| Values | Content | Sea initial | Tinylicious initial | Sea update growth | Tinylicious update growth |
| --- | --- | ---: | ---: | ---: | ---: |
| 256 KiB | Pseudorandom hex | 277,837 | 147,172 | 19,283 | 35,809 |
| 256 KiB | Repeated text | 277,837 | 8,644 | 19,283 | 19,518 |
| 4 MiB | Pseudorandom hex | 4,372,045 | 2,288,998 | 20,566 | 28,399 |
| 4 MiB | Repeated text | 4,372,045 | 70,948 | 20,566 | 20,279 |

Both summary modes avoid rewriting all unchanged content.
Tinylicious Git compression reduces repeated-content size; Sea's optional compression decorator is not enabled.
The Tinylicious samples logged 693 checkpoint-write errors, including its existing unimplemented `Collection.deleteMany` cleanup.
All persistence assertions passed, but this does not establish healthy cleanup or steady-state retention.

## Implementation and Test Inventory

Current tracked source, counted with `cloc 2.06`.
Scopes follow local non-development dependencies and include tests and conditional code, not linker reachability.
Generated entry points, build output, and external dependencies are excluded.
Test/support classification uses path conventions and syntax-derived Rust test spans.

| Scope | Files | Code lines | Test/support subset | Other code |
| --- | ---: | ---: | ---: | ---: |
| Sea native server dependency closure | 72 | 34,207 | 16,308 | 17,899 |
| Tinylicious server dependency closure | 335 | 35,977 | 10,824 | 25,153 |
| Tinylicious wrapper, subset of preceding row | 35 | 2,492 | 521 | 1,971 |
| Sea TypeScript clients/adapters, separate scope | 24 | 5,618 | 2,686 | 2,932 |

The native Sea server's production/build dependency graph contains 161 dependencies: 155 external crates and six workspace crates.
Tinylicious's production graph contains 318 dependencies: 306 external npm packages and 12 workspace packages.
Counts deduplicate name/version pairs and exclude the root package.
Crates and npm packages are not equivalent units, and source counts do not measure quality or maintenance effort.

The refreshed Sea Fluid end-to-end run completed **691 passing, zero failing, and 493 pending** cases.
This includes two historical-loader entry-point passes, not historical Sea compatibility coverage.
The full native/WASM/TypeScript/browser validation also passed with the new default.
Tinylicious's end-to-end inventory was not rerun; its benchmark, browser, and summary results above were.

## Limits and Further Reading

- These are short loopback runs on a shared virtual machine, not production capacity or physical power-loss qualification.
- Three repetitions show observed variation, not confidence bounds.
  Browser case order is fixed; stress configuration order is varied.
- Completed runs with reader shedding are not all-reader capacity results.
  Failed samples and shortened memory diagnostics remain separate.
- Measured-window latency excludes completions during drain.
  Total memory is not bounded by the admission window or cache targets.
- Transport, persistence, client runtime, and integration responsibilities differ between stacks.
  No language-only or equal-durability claim is made.
- Connection/drain failures under overload and Tinylicious checkpoint-cleanup errors remain unresolved.
- Sea lacks production hardening, distributed failover, and physical-device durability qualification.

The [AI-assisted development guide](AGENTIC_DEVELOPMENT.md) describes the workflow and its limits.
Historical evidence remains in the [September 24 refresh](measurements/overview-refresh-20260924/README.md), [scheduling measurements](measurements/unpaced-throughput-20260928/README.md), and [durable admission checkpoint](measurements/durable-admission-20260929/README.md).
Those datasets explain earlier changes; they are not the current headline measurements.
