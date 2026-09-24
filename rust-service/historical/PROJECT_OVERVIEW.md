# Sea: Project Overview

Project record as of 2026-09-24; measurements use the revisions listed below.
For the current implementation and limitations, start with the [project README](../README.md).

Sea (Snapshotted Event Archive) is an experimental Rust service for ordered application events, immutable blob trees, and snapshots.
Applications own event meaning and snapshot content; the service owns ordering and publication authority.
Fluid integration is optional.

This overview describes the architecture, development workflow, measured behavior, and known limitations.
Sea is a single-host experiment, not a production replacement for an existing Fluid service.
For setup and usage, see the [project README](../README.md); for service contracts, see the [architecture guide](../SEA_ARCHITECTURE.md).

## Architecture

Native and browser clients access the sequencer locally or over a network transport.
Storage options include memory, buffered-file, and durable-file backends with different persistence guarantees.
The built-in host uses a shared live-event cache by default while retaining storage as the authority for recovery and historical catch-up.

```mermaid
flowchart LR
   Application[Application or Fluid adapter] --> Client[Native or browser client]
   Client -->|Local, WebTransport, or WebSocket| Sequencer[Sequencer]
   Sequencer --> Cache[Shared live-event cache]
   Cache --> Storage[Memory, buffered-file, or durable-file]
```

## AI-Assisted Development

See the [agentic-development guide](AGENTIC_DEVELOPMENT.md) for the workflow, representative iterations, human involvement, and what the records can establish about effectiveness.

The project used agent-written reusable skills to coordinate parallel groups of agents and to design and run quality iterations.
The coordinator knew a private evaluation target: a bug fix had exposed missing coverage, and the added regression test was poorly placed.
The audit agents received general quality guidance, not that target.

The skills were refined and the audits repeated.
The objective was partly achieved, then further runs stopped producing material improvements within the chosen scope.
That was a stopping condition, not evidence that the code was defect-free.

```mermaid
flowchart LR
   Setup[Agent writes coordination skills] --> Coordinator[Agent designs quality iterations]
   Private[Known coverage and test-placement defect] -.->|Private evaluation target| Coordinator
   Coordinator -->|General guidance, not the target| Workers[Parallel audit agents]
   Workers --> Evidence[Repairs and validation evidence]
   Evidence --> Review[Evaluate results]
   Review -->|Useful refinement| Skills[Refine quality skills]
   Skills --> Coordinator
   Review -->|No further material improvement in scope| Stop[Stop: partial objective achieved]
```

The diagram does not imply fully autonomous or concurrent execution of every step.
The private-target account comes from the project author and does not describe deliberate defect seeding.
Supporting records: [quality-iteration skill](../../.github/skills/rust-service-quality-iteration/SKILL.md), [iteration 0016 skill review](iterations/0016/skill-review.md), and [iteration 0017 convergence assessment](iterations/0017/phase-3-report.md#convergence-assessment).
They support the method and its limits, not the complete private-evaluation chronology.

## Measurement Scope

The current refresh uses clean commit `dfadc07d6e03afa2bf55795d669fdf3e60901d20`.
Source inventory, repeated stress, native transport, capacity, browser, summary/cold-load, and Sea end-to-end groups below have been refreshed.
Dependency counts are unchanged from the 2026-09-23 campaign.
The Tinylicious end-to-end inventory also retains that campaign because no Tinylicious changes were pulled into the branch.
The prior complete campaign used clean commit `240798434cf591f4db2366a1a3b6b6a7438bd015`; its 72-sample summary campaign used `22309cf9d169c4f7986b6ce1db184427269f9656`.

All file-backed Sea and Tinylicious service data used fresh owned directories directly under `/tmp`.
The host reported AMD EPYC 7763, Linux `6.8.0-1064-azure`, Node.js `22.23.2`, Rust `1.98.1`, and 32 logical CPUs.
`/tmp` was ext4 on `/dev/sdb1[/containerTmp]`; benchmark artifacts remained outside service-data directories.

The current refresh has retained:

- 180 primary repeated stress attempts and 11 bounded replacement attempts;
- 136 capacity probes across all 30 storage/core/payload rows;
- 160 passing browser samples;
- 72 passing summary and cold-load samples;
- the complete Sea end-to-end test inventory;
- current source inventory.

The [retained dataset](measurements/overview-refresh-20260924/README.md) records every refreshed value and identifies the unchanged 2026-09-23 inventories.
These are local, single-host stack comparisons with different features, transports, and persistence guarantees.
They are not production capacity estimates or language-only comparisons.

## At a Glance

Throughput cells give **64-byte / 8,192-byte offered operations/s**.
Sea eight-core capacity uses eight service cores and eight separate generator cores; Tinylicious uses four generators because its measured ceiling does not require more.
Values are the highest observed threshold pass, not repeated maximum-capacity estimates.
The corresponding higher failure appears in [Storage and Core Exploration](#storage-and-core-exploration).
✅ marks a favorable measured result or a shared positive outcome within the stated scope, not overall superiority.

| Aspect | Snapshotted Event Archive (Sea) | Tinylicious |
| --- | --- | --- |
| Language | Rust | TypeScript |
| Runtime | ✅ Native or WASM | JavaScript |
| First-party code | ✅ 29,716 lines:<br>13,762 test/support + 15,954 other | 35,977 lines:<br>10,824 test/support + 25,153 other |
| Transitive dependencies | ✅ 161 crates:<br>155 external + 6 workspace | 318 npm packages:<br>306 external + 12 workspace |
| Representative libraries | Tokio, Quinn/wtransport, rustls, Serde, Postcard | Express, Socket.IO, isomorphic-git, LevelDB, Winston |
| Supported streams | ✅ WebTransport, WebSocketStream, WebSocket | WebSocket via Socket.IO<br>(❌ no application-level receive backpressure) |
| Recorded end-to-end test execution | ✅ 691 passed, 0 failed | ✅ 4,049 passed, 0 failed |

| Aspect | Snapshotted Event Archive (Sea) | Tinylicious |
| --- | --- | --- |
| Operation throughput: memory<br>(64 B / 8,192 B payload)<br>(8 cores) | ✅ 80,000 / 32,000 ops/s | 1,000 / 800 ops/s |
| Operation throughput: disk, buffered<br>(64 B / 8,192 B payload)<br>(8 cores) | ✅ 48,000 / 28,000 ops/s | 800 / 200 ops/s (LevelDB) |
| Operation throughput: durable<br>(64 B / 8,192 B payload)<br>(8 cores) | ✅ 5,000 / 4,000 ops/s | ❌ No durable acknowledgment in tested configuration |
| Memory at matched 500 ops/s<br>(64 B / 8,192 B payload)<br>(4 cores) | ✅ 40.11 / 72.72 MiB RSS | 168.02 / 220.47 MiB RSS |

Source scopes include tests and different feature sets; dependency and test counts are not quality scores.
Sea's WebTransport and WebSocketStream paths support streaming backpressure; ordinary WebSocket uses bounded fail-stop receive queues instead.
Tinylicious's disk entry is LevelDB without explicitly synchronized writes and is not durability-equivalent to Sea durable-file.

<details>
<summary>Test scope, dependency counting, and guarantees</summary>

The current Sea run completed with **691 passing, 0 failing, and 493 pending**.
Its totals comprise 689 current-version passes and 486 pending cases, plus two historical-loader entry-point passes and seven pending historical cases.
Those two local historical-loader passes are entry-point coverage, not Sea compatibility coverage.

The retained Tinylicious default run completed with **4,049 passing, 0 failing, and 1,921 pending**.
It includes generated layer and cross-client compatibility configurations, so its denominator is not comparable to Sea's current-version-only selection.
Comparing current-version identities retains the previously established shared set: Sea passes all 669 recorded Tinylicious current-version passes plus 20 cases Tinylicious skips.

Reproduce from `packages/test/test-end-to-end-tests/`:

```bash
node scripts/seaRunner.mjs --no-bail
pnpm run test:realsvc:tinylicious
```

Dependency counts are deduplicated by package name and version and exclude the root package.
Sea includes normal and build edges plus proc macros for Linux x86-64 with `websocket-stream`; development-only edges are excluded.
Tinylicious uses its installed production graph with workspace links normalized.
Crates and npm packages are not equivalent units.

```bash
cargo tree --manifest-path rust-service/Cargo.toml --locked \
  --package sea-webtransport-server --features websocket-stream \
  --target x86_64-unknown-linux-gnu --edges normal,build --prefix none --format '{p}'
pnpm --dir server/routerlicious --filter tinylicious list --prod --depth Infinity --json
```

</details>

## Source Lines to Maintain

Repository-owned dependency scopes, including tests; not equivalent feature sets or a measure of maintenance effort.

```mermaid
---
config:
  xyChart:
    height: 380
    showDataLabel: true
    showDataLabelOutsideBar: true
  themeVariables:
    xyChart:
      plotColorPalette: "#167d8d"
---
xychart-beta horizontal
  title "Server source: test/support, other code, and total"
  x-axis ["Sea: test/support", "Sea: other code", "Sea: total", "Tinylicious: test/support", "Tinylicious: other code", "Tinylicious: total"]
  y-axis "Code lines" 0 --> 40000
  bar [13762, 15954, 29716, 10824, 25153, 35977]
```

| Scope | Files | Code lines | Comment lines | Test/support code subset | Other code |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sea native server local non-development dependency closure | 62 | 29,716 | 2,709 | 13,762 | 15,954 |
| Tinylicious local server dependency closure | 335 | 35,977 | 7,538 | 10,824 | 25,153 |
| Tinylicious wrapper only, a subset of the preceding row | 35 | 2,492 | 356 | 521 | 1,971 |
| Sea TypeScript clients and adapters, separate from native scope | 24 | 5,618 | 718 | 2,686 | 2,932 |

cloc 2.06 counts tracked Rust, TypeScript, and JavaScript.
Scopes follow local non-development manifest edges, not linker reachability; generated entry points, package-version files, build output, and external dependencies are excluded.
Test/support classification uses path/name conventions plus syntax-derived Rust test spans.
See the [collection scripts guide](../scripts/README.md#commands) to regenerate the inventory.

## Matched-Load Resources

500 operations/s; 32 documents, one writer and observer each; four service cores plus four generator cores.
Sea memory with the production Node/WASM WebSocket client versus Tinylicious's in-memory database, Socket.IO client, and filesystem Git summaries.
Each row contains ten fresh passing runs with three warmup seconds and ten measured seconds.

```mermaid
---
config:
  xyChart:
    height: 320
  themeVariables:
    xyChart:
      plotColorPalette: "#167d8d"
---
xychart-beta horizontal
  title "Service memory at 500 operations/s"
  x-axis ["Sea, 64 B", "Tinylicious, 64 B", "Sea, 8192 B", "Tinylicious, 8192 B"]
  y-axis "Median mean RSS (MiB)" 0 --> 250
  bar [40.11, 168.02, 72.72, 220.47]
```

| Payload | Service | Mean RSS median (min-max), MiB | CPU, % | Worst-worker p95 median, ms |
| --- | --- | ---: | ---: | ---: |
| 64 bytes | Sea | 40.11 (40.05-40.21) | 9.74 | 0.53 |
| 64 bytes | Tinylicious | 168.02 (167.26-169.98) | 38.86 | 2.78 |
| 8,192 bytes | Sea | 72.72 (72.52-72.96) | 14.60 | 0.75 |
| 8,192 bytes | Tinylicious | 220.47 (219.50-226.34) | 48.13 | 3.12 |

RSS is the median of run means; CPU is the median, with 100% equal to one occupied core.
Latency is the median of run worst-worker p95 values.
All 40 samples delivered the offered load with exact acknowledgments and zero missing deliveries.

## Repeated Throughput

Memory-backed operation storage; 32 documents and the same timing boundaries as matched load.
Rates are tested loads, not capacity maxima; payload bandwidth excludes protocol overhead.

### Native Sea Transports

Four service cores and four separate native generator cores.
WebTransport includes QUIC/TLS; loopback WebSocket is unencrypted.

| Transport | Payload | Offered ops/s | Outcome | Delivered ops/s median (min-max) | CPU, % | RSS median, MiB | Worst-worker p95 range, ms |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| WebSocket | 64 bytes | 12,000 | 10/10 pass | 11,999.6 (11,996.6-12,002.1) | 121.85 | 64.32 | 0.99-1.09 |
| WebTransport | 64 bytes | 12,000 | 10/10 pass | 11,999.8 (11,998.1-12,000.4) | 127.49 | 43.85 | 1.55-1.87 |
| WebSocket | 64 bytes | 24,000 | 10/10 pass | 23,999.1 (23,991.4-24,001.6) | 230.45 | 91.59 | 2.08-2.65 |
| WebSocket | 8,192 bytes | 6,000 | 10/10 pass | 5,999.5 (5,998.1-6,000.7) | 105.79 | 425.56 | 1.05-1.08 |
| WebTransport | 8,192 bytes | 6,000 | 10/10 pass | 5,998.7 (5,997.3-5,999.8) | 176.07 | 402.06 | 3.19-3.62 |
| WebSocket | 8,192 bytes | 12,000 | 10/10 pass | 11,998.1 (11,995.5-12,000.7) | 204.45 | 812.81 | 1.98-2.04 |

All 60 accepted native Sea samples passed exact drain and integrity checks.
An initial attempt used a stale staged generator binary and failed before readiness; those invalid samples are excluded.
The accepted rerun used matching server and generator binaries built from the recorded source revision.

### Tinylicious

Node Socket.IO, in-memory database, and filesystem Git summaries; four generator cores.

| Payload | Service cores | Delivered ops/s median (min-max) | CPU, % | Worst-worker p95 range, ms |
| --- | ---: | ---: | ---: | ---: |
| 64 bytes | 1 | 750.0 (749.5-750.1) | 63.99 | 4.86-17.45 |
| 64 bytes | 4 | 749.9 (749.3-750.1) | 63.52 | 2.80-3.27 |
| 8,192 bytes | 1 | 749.7 (749.1-750.0) | 77.27 | 6.40-25.92 |
| 8,192 bytes | 4 | 749.7 (748.7-749.9) | 78.60 | 3.90-24.52 |

### Node/WASM Sea Client

WebSocket and Sea memory; four generator cores.
The historical one-core 12,000-small point failed all ten runs at full service-core saturation, so a bounded 10,000-small replacement group was collected and passed 10/10.

| Payload | Service cores | Offered ops/s | Delivered ops/s median (min-max) | CPU, % | RSS median, MiB | Worst-worker p95 range, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 bytes | 1 | 10,000 | 9,998.2 (9,996.8-9,999.5) | 82.11 | 59.57 | 2.77-3.11 |
| 64 bytes | 4 | 16,000 | 15,997.4 (15,996.3-16,000.1) | 174.36 | 74.18 | 3.36-6.61 |
| 8,192 bytes | 1 | 6,000 | 5,998.4 (5,984.9-5,999.2) | 90.40 | 425.21 | 8.28-39.34 |
| 8,192 bytes | 4 | 8,000 | 7,997.0 (7,995.4-7,999.0) | 154.54 | 555.13 | 3.66-11.61 |

## Optimized Browser Results

Ten repetitions per path and DDS mode; 100 warmup edits and 1,000 measured edits.
Every one of the 160 samples passed writer/observer convergence.
Median edits/s averages the two central raw values and ranges are observed minima and maxima.

```mermaid
---
config:
  xyChart:
    height: 360
  themeVariables:
    xyChart:
      plotColorPalette: "#167d8d"
---
xychart-beta horizontal
  title "Dummy DDS"
  x-axis ["Sea local direct", "Sea local Fluid", "TypeScript local", "Sea WebTransport Fluid", "Sea WebTransport direct", "Sea WebSocketStream Fluid", "Sea WebSocketStream direct", "Tinylicious"]
  y-axis "Median edits/s (thousands)" 0 --> 14
  bar [9.625, 2.137, 0.841, 1.265, 2.759, 0.963, 1.721, 3.199]
```

```mermaid
---
config:
  xyChart:
    height: 360
  themeVariables:
    xyChart:
      plotColorPalette: "#3565a8"
---
xychart-beta horizontal
  title "Real SharedTree"
  x-axis ["Sea local direct", "Sea local Fluid", "TypeScript local", "Sea WebTransport Fluid", "Sea WebTransport direct", "Sea WebSocketStream Fluid", "Sea WebSocketStream direct", "Tinylicious"]
  y-axis "Median edits/s (thousands)" 0 --> 14
  bar [1.986, 1.215, 0.639, 0.864, 1.312, 0.725, 0.972, 1.542]
```

| Path | Storage backend | Dummy DDS | Real SharedTree |
| --- | --- | ---: | ---: |
| Sea local direct | Sea memory | 9,625 (8,658-10,215) | 1,986 (1,889-2,053) |
| Sea local Fluid | Sea memory | 2,137 (2,080-2,223) | 1,215 (1,198-1,267) |
| TypeScript local | Browser `sessionStorage` database | 841 (775-983) | 639 (573-682) |
| Sea WebTransport, Fluid | Sea memory | 1,265 (1,168-1,334) | 864 (804-940) |
| Sea WebTransport, direct | Sea memory | 2,759 (2,440-3,175) | 1,312 (1,241-1,353) |
| Sea WebSocketStream, Fluid | Sea memory | 963 (915-989) | 725 (690-741) |
| Sea WebSocketStream, direct | Sea memory | 1,721 (1,556-1,778) | 972 (930-1,023) |
| Tinylicious | In-memory database; filesystem Git summaries | 3,199 (2,659-3,568) | 1,542 (1,386-1,621) |

Both DDS modes use one scalar edit per turn, no per-turn convergence wait, then final convergence.
Direct paths omit Fluid runtime responsibilities and are not drop-in equivalent Fluid drivers.
Browser and service processes share CPUs `8,10,12,14,16,18,20,22`.
External Sea cases explicitly enable the live cache; Sea and Tinylicious service data use separate owned `/tmp` directories.
The final Tinylicious SharedTree group recorded a dirty worktree only because this overview's documentation-only refresh was in progress; all executable sources and built artifacts remained at the recorded revision.

## Storage and Core Exploration

**Offered operations/s: highest observed threshold pass / higher observed failure.**
Single-run probes, not repeated capacity estimates.
Sea uses native WebSocket; Tinylicious uses Node Socket.IO.
All use 32 documents, three warmup seconds, ten measured seconds, and fresh data.
Eight-core Sea rows use eight generator processes; other rows use four.

| Payload | Service cores | Sea memory | Sea buffered-file | Sea durable-file | Tinylicious in-memory DB | Tinylicious LevelDB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 bytes | 1 | 10,000 / 12,000 | 5,000 / 6,000 | 2,000 / 4,000 | 900 / 1,000 | 500 / 800 |
| 64 bytes | 4 | 44,000 / 52,000 | 24,000 / 40,000 | 4,000 / 6,000 | 800 / 900 | 1,000 / 1,100 |
| 64 bytes | 8 | 80,000 / 96,000 | 48,000 / 56,000 | 5,000 / 6,000 | 1,000 / 1,100 | 800 / 1,100 |
| 8,192 bytes | 1 | 6,000 / 7,000 | 3,500 / 4,000 | 2,000 / 4,000 | 800 / 900 | 100 / 200 |
| 8,192 bytes | 4 | 24,000 / 28,000 | 12,000 / 16,000 | 4,000 / 8,000 | 800 / 900 | 200 / 300 |
| 8,192 bytes | 8 | 32,000 / 40,000 | 28,000 / 36,000 | 4,000 / 6,000 | 800 / 900 | 200 / 300 |

Passing requires at least 98% submitted and delivered in-window; every worker p95 and scheduling lag at most 100 ms; exact Sea acknowledgment and drain integrity; and zero final errors or missing deliveries.
Some higher Sea failures terminated on exact-drain rather than returning a normal threshold result.
The bracket records the observed boundary, not a diagnosis of the limiting resource.

The live cache changes the file-backed result substantially: caught-up readers receive the event published by the sequencer rather than each independently reopening the just-written record.
Buffered eight-core throughput is now 48,000 / 28,000 small/large operations/s versus the prior cache-disabled overview's 10,000 / 9,000.
Durable results are also much higher, but remain sensitive to acknowledgment batching, per-document concurrency, and failure mode.

## Summary and Cold-Load Measurement Campaign

Sea buffered-file and durable-file are compared with Tinylicious LevelDB operation storage and filesystem Git summary storage.
The fixture contains eight SharedMaps with either 32 or 512 values of 1,024 bytes each: 256 KiB or 4 MiB of application values.
It crosses pseudorandom hexadecimal and repeated text, full and incremental summary modes, and all three backends.
All 72 samples passed snapshot-fingerprint, map-content, and 200-tail-operation verification.

Each paired timing cell gives **full / incremental** mode, in milliseconds, and is the median of three independent documents.
Upload covers the storage call.
Download uses a fresh service/client and reads every unique blob with fanout eight.
Cold load restarts the service and client, realizes all eight DDSes, and replays the tail.
The OS page cache is not cleared.

| Application values | Data | Backend | Summary upload | Complete snapshot download | Process-cold document load |
| --- | --- | --- | ---: | ---: | ---: |
| 256 KiB | Pseudorandom hex text | Sea buffered | 22.2 / 13.1 | 129.0 / 125.7 | 188.6 / 185.3 |
| 256 KiB | Pseudorandom hex text | Sea durable | 28.9 / 19.2 | 124.9 / 131.5 | 187.5 / 188.8 |
| 256 KiB | Pseudorandom hex text | Tinylicious LevelDB | 51.1 / 37.1 | 165.5 / 164.5 | 253.6 / 254.1 |
| 256 KiB | Repeated text | Sea buffered | 22.0 / 12.7 | 124.8 / 128.5 | 189.2 / 191.8 |
| 256 KiB | Repeated text | Sea durable | 28.7 / 18.9 | 124.0 / 127.1 | 185.5 / 184.0 |
| 256 KiB | Repeated text | Tinylicious LevelDB | 51.5 / 35.6 | 165.0 / 165.1 | 248.8 / 241.9 |
| 4 MiB | Pseudorandom hex text | Sea buffered | 107.1 / 26.2 | 229.6 / 225.8 | 288.7 / 294.2 |
| 4 MiB | Pseudorandom hex text | Sea durable | 112.8 / 35.2 | 227.5 / 231.8 | 297.8 / 298.6 |
| 4 MiB | Pseudorandom hex text | Tinylicious LevelDB | 119.3 / 50.4 | 576.3 / 558.6 | 637.7 / 616.4 |
| 4 MiB | Repeated text | Sea buffered | 104.9 / 28.1 | 226.6 / 226.4 | 292.1 / 295.0 |
| 4 MiB | Repeated text | Sea durable | 109.4 / 35.3 | 236.4 / 226.9 | 285.3 / 301.1 |
| 4 MiB | Repeated text | Tinylicious LevelDB | 120.7 / 45.9 | 509.0 / 524.8 | 588.6 / 602.6 |

At 4 MiB of pseudorandom hex text, incremental upload was 4.09 times faster than full upload on buffered Sea and 2.37 times faster on Tinylicious.
Buffered Sea's incremental cold load was 2.10 times faster than Tinylicious in this workload.
Three repetitions provide observed medians, not confidence bounds.

### Summary and Operation Sizes

Full summaries contain zero handles and incremental summaries contain nine.
The following are apparent file bytes measured after initial attachment and growth caused by the acknowledged update summary.
Tinylicious's initial column includes Git storage; its initial LevelDB files add approximately 1.3 KiB.
Sea uses a mixed journal, so its initial column includes document records as well as summary content.

| Application values | Data | Sea initial journal | Tinylicious initial Git files | Sea update growth | Tinylicious update growth |
| --- | --- | ---: | ---: | ---: | ---: |
| 256 KiB | Pseudorandom hex text | 277,837 | 147,170 | 19,283 | 35,227 |
| 256 KiB | Repeated text | 277,837 | 8,642 | 19,283 | 19,527 |
| 4 MiB | Pseudorandom hex text | 4,372,045 | 2,288,998 | 20,566 | 28,396 |
| 4 MiB | Repeated text | 4,372,045 | 70,947 | 20,566 | 20,283 |

Content-addressed storage avoids rewriting all unchanged bytes in both summary modes.
Tinylicious Git compression substantially reduces repeated-content size; Sea's optional compression decorator is not enabled.
Tinylicious emitted 647 existing `Collection.deleteMany: Method not implemented` checkpoint-cleanup errors across its 24 samples.
All persistence assertions passed, but these samples do not establish healthy checkpoint cleanup or steady-state retention.

## Scope and Limitations

- Results are short single-host loopback measurements on a shared virtual machine.
- Passing capacity probes establish only observed bounds under this workload.
- Persistence modes do not have equal acknowledgment or power-loss guarantees.
- The OS page cache remains warm across process-cold summary reads.
- Browser path order is fixed, not randomized or interleaved.
- Direct browser paths omit Fluid runtime responsibilities.
- Source, dependency, and test counts describe different feature sets and are not quality or maintenance scores.
- Native WebTransport results after the opening-stream lifecycle fix are not directly comparable with the original broken-stream samples.
- Tinylicious checkpoint cleanup errors remain unresolved.
- Sea is experimental and lacks production hardening, distributed failover, and physical-device durability qualification.
