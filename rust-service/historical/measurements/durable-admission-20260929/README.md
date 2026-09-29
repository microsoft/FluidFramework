# Durable Author Admission, 2026-09-29

This dataset retains the durable admission comparison; see the [project overview](../../PROJECT_OVERVIEW.md) for current results.
The comparison base is `de1a93a99c40924bee6bdbd07b3345384e4743b1`.
The candidate changes transport admission and the policy wrapper's FIFO handoff, not the sequencer, file backend, persistence format, filesystem worker limit, or QUIC windows.

## Matched Workload

Each durable cell contains three successful runs: WebTransport, 32 documents, eight service cores, eight native generator processes, 64-byte application payloads, one second of warmup, and eight measured seconds.
Each document has a writer echo and an observer, for 64 subscriptions.
Streamed generation waits for transport capacity rather than each acknowledgement; its drain allowance remains 120 seconds.
The memory acknowledgement-paced control uses three interleaved baseline/candidate pairs.
Durable baseline and candidate campaigns ran sequentially, not as randomized pairs.

All retained measurements used fresh, owned backend directories directly under `/tmp`.
Their recorded filesystem is `ext4`, mount source `/dev/sdb1[/containerTmp]`, device `2065`.
The harness removed those directories after each run.
Executable and result locations outside `/tmp` do not change the backend-data location.

| Backend / mode | Baseline writes/s | Candidate writes/s | Baseline reads/s | Candidate reads/s |
| --- | ---: | ---: | ---: | ---: |
| Durable, acknowledgement-paced | 6,128 | 6,172 | 12,257 | 12,344 |
| Durable, streamed | 6,086 | 231,170 | 12,171 | 462,347 |
| Memory, acknowledgement-paced | 113,437 | 112,293 | 226,874 | 224,587 |

Values are medians of the per-run rates, rounded to the nearest integer.
Every run passed acknowledgement, ordering, payload, and reader-drain checks, with zero shed subscriptions.
The streamed durable write improvement is approximately 38 times.
The memory control's median write rate is approximately 1% lower, with overlapping observed ranges; this is not evidence of a statistically established zero-cost change.

For streamed durable writes, the median of the largest worker drain duration fell from 82.208 seconds to 2.283 seconds.
The median of the largest worker acknowledgement p95 fell from 8.622 seconds to 2.509 seconds.
These latency samples include only acknowledgements received inside the measurement window: the old server's long-draining suffix is excluded, and the values are neither pooled percentiles nor filesystem latency.
Durable acknowledgement-paced p95 remained approximately 6.6 milliseconds.
The streamed server used a median 618% of one CPU rather than 305%, while median peak RSS rose from 61.4 MiB to 97.7 MiB.
Those runs complete very different amounts of work; RSS is not an isolated measurement of the pending-input budget.

## Separate Queue and Batch Diagnostics

Matched `strace` runs used one document, one service core, and one generator, with the same payload, warmup, measurement, and drain durations.
Their timings are not included in the throughput comparison.
The profile covers startup, warmup, measurement, drain, and shutdown, not just the measured window.

| Observed journal evidence | Baseline | Candidate |
| --- | ---: | ---: |
| Application records | 22,221 | 229,906 |
| Complete application write groups | 22,221 | 3,599 |
| Mean applications per group | 1.00 | 63.88 |
| Largest application group | 1 | 127 |
| Successful journal `fsync` calls | 22,221 | 3,599 |
| All successful service `fsync` calls per application | 3.0085 | 0.0548 |

The parser checks full successful writes, frame lengths and their complements, and storage/sequencer envelope tags; it does not recompute frame checksums.
Snapshot-journal writes are excluded from application groups, while the all-service `fsync` count includes checkpoints and startup.
Raw trace hashes and the complete group histogram are retained.

The candidate's production transport counters reached 128 pending author requests and 9,088 encoded input bytes on one stream.
These counters include completed requests awaiting ordered responses.
They do not measure total memory or directly sample sequencer/storage queue occupancy.
The observed 127-record group establishes that the existing sequencer assembled at least that many queued entries for a batch.
The baseline predates the new counters; absent fields are not represented as zero.
Both listener snapshots are retained rather than selecting the first, inactive WebSocket listener.

The existing sequencer/file batching path therefore does aggregate individually arriving submissions once the two completion gates are removed.
This checkpoint introduces no second batcher, storage scheduler, cursor optimization, or `io_uring` dependency.

## Attribution and Retained Evidence

[`campaign-summary.json.gz`](campaign-summary.json.gz) retains configurations, per-worker distributions and integrity results, machine/filesystem provenance, build receipts, raw-result hashes, profile counters, and trace hashes.
SHA-256: `8013fb506c29801099b656f2e0579dd1cbefc0f2cf1d7242a1f29bf14f81ca8c`.

[`native-and-harness.patch.gz`](native-and-harness.patch.gz) reconstructs the measured native and harness changes against the fixed base.
The candidate native-input fingerprint is `ca4bfcac1ab3ba24d8104468020985c4414e0f544b980c2b347dbd91d1602872`.
The report and dataset are not native build inputs.

Independent review found an ordering defect when the policy wraps encryption: encryption's non-FIFO mutex allowed a newly polled caller to overtake a waiting submission.
A deterministic composed-session test reproduced it; encryption now reserves a FIFO turn.
A related regression reproduced native client admission yielding before its FIFO reservation when the cooperative budget is exhausted.
Both adapters now reserve their turns before that yield, and the shared author contract explicitly requires first-poll ordering.
The encryption adapter still serializes its own appends; encrypted throughput is not measured here.

[`reviewed-native-and-harness.patch.gz`](reviewed-native-and-harness.patch.gz) contains the complete fixed-base source patch including those repairs.
Its SHA-256 is `7243ce57f5b8a7ae4c5e706c2fa2f3d2bb16259c3aa2dbbf7088af8cd88984a3`.
The repaired native-input fingerprint is `a954de17249050cc18d3071d943fd7ff46bb0976b77fdc7fdf6458ce73222532`.
A fresh release rebuild produced a byte-identical server executable, so the server measurements remain attributable to the repaired implementation.
The generator remains the same frozen baseline executable for both sides of every comparison; the rebuilt candidate generator is not substituted.

| Frozen executable | SHA-256 |
| --- | --- |
| Baseline server | `07089ae640413bf16890bcd281a1d407e0d7c6875d95724093ee0a1edea9b8e9` |
| Candidate server | `af7fe994b3c6718f1e96a845980710729529e7031d704ea5d9bc58d23b77688e` |
| Generator used for both | `c41e08e7ebdb451f1a1ed2878468e1644181ed8454be58471730e733498dc834` |

The binaries were copied out of the build directory before measurement.
Collection-time dirty-worktree records describe the harness checkout, not the source of the explicitly selected historical executable.
Full timestamp/backlog/resource arrays, traces, logs, and binaries remain in the session evidence directory recorded by the dataset.
The compact export omits those large arrays.
Exploratory overlay-filesystem runs, an unsuccessful one-second profile, and earlier candidate prototypes are excluded from the comparison.

Validation passed strict workspace all-target/all-feature Clippy, strict rustdoc, all-target compilation, affected-crate all-feature suites, and `./test.sh --extended`.
The extended gate includes the browser connection-release regression, generated WASM/TypeScript consumers, Fluid integration, and real Chromium transports.
Repository `pnpm build:fast`, benchmark-helper tests, formatting, documentation, policy, and diff checks also passed.
These gates were repeated after the ordering repairs.
The first repaired extended run hit a 20-second Chromium-runner startup timeout and a consequent cleanup assertion; the isolated unchanged test and then the full unchanged extended gate passed.
The failed run is retained alongside the passing rerun, not omitted from validation history.
These short loopback runs do not establish production capacity, long-duration stability, high-RTT behavior, or physical power-loss durability.

## Reproduction

Build and preserve the baseline and candidate executables separately using the [receipt-producing builder](../../../scripts/README.md#native-build-verification).
Use the same frozen generator for both.
Run the following shape from the repository root with explicit `serverBinary` and `generatorBinary` paths added to the configuration when comparing preserved variants:

```bash
SEA_MAX_CONNECTIONS=128 \
SEA_AUTHOR_WINDOW=128 \
SEA_EXPERIMENTAL_RESOURCE_POLICY=true \
SEA_EXPERIMENTAL_SESSION_FACTORY=false \
node rust-service/scripts/benchmark-stress.mjs run \
	'{"backend":"sea","storage":"durable-file","generator":"native","transport":"webtransport","documents":32,"cores":8,"generatorProcesses":8,"payloadBytes":64,"warmupSeconds":1,"seconds":8,"liveCache":true,"loadMode":"streamed","drainTimeoutSeconds":120}' \
	/path/to/new-output
```

Set `SEA_AUTHOR_WINDOW=128` to reproduce the measured candidate configuration; the current default is 256.
For acknowledgement pacing, select `"loadMode":"closed-loop"` and omit `drainTimeoutSeconds`.
Select `"storage":"memory"` for the memory control.
Use three fresh output directories per cell.
For separate diagnostic runs, select one document/core/generator and set `captureTransportEvidence` to `true`.
The traced server wrapper uses `strace -D -ff -qq -ttt -T -yy -xx -s 65536 -e trace=write,fsync,rename`.
Do not mix traced or shutdown-marker diagnostic timings into the primary comparison.
