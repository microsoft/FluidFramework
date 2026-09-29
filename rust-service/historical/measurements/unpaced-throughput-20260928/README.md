# Unpaced Throughput and Reader Fanout, 2026-09-28

This dataset retains the September 28 unpaced measurements; see the [project overview](../../PROJECT_OVERVIEW.md) for current results.
The implementation was integrated at `0c518931158769b5897f7db28bdb0e1cd20eb7be`, compared with `ec25dd4c8b5daad2fcd653e17132654bf4432d51`.
Measurements preceded the commit and used the exact server/generator variants identified by their SHA-256 values, not one common binary for every campaign.
The final integration includes read counters added after the matched comparison and formatting-only harness changes.

## Retained Evidence

[`campaign-summary.json.gz`](campaign-summary.json.gz) retains:

- the initial WebSocket acknowledgment-paced aggregates and campaign records, including the eight-generator control;
- the initial WebTransport streamed results, including the failed durable drain;
- all 24 final original/updated scheduling comparison records and all six separate-read-counter samples;
- compact results with exact configuration, CPU affinity, filesystem provenance, reader outcomes, per-document counters, transport statistics, and drain/integrity outcomes where available;
- diagnostic campaign summaries, including failed scheduling prototypes, timing-cap failures, and the six no-load startup failures caused by an incorrectly featured server build;
- validation outcomes, binary identities, and SHA-256 fingerprints of the source result files.

SHA-256: `21d1ffd7b001e57a4b9498ca867cf8f208f4e30a768ef39d86d264aba1064b38`.

[`measured-source-patches.json.gz`](measured-source-patches.json.gz) contains the pre-counter and final-counter implementation patches against the comparison base, including untracked additions.
These identify the measured source separately from later formatting and report changes.
SHA-256: `8b869ed30fa1109e72ee17bfab7b4743d405390787a47cd252f58bc2082de7cf`.

```bash
gzip -dc campaign-summary.json.gz | jq '.comparison.comparisons, .fanout.rows'
gzip -dc measured-source-patches.json.gz | jq 'map({path, sha256})'
```

Per-operation timestamp arrays, periodic backlog samples, process resource samples, raw logs, and executable binaries remain outside the repository in the session evidence directory recorded by the dataset.
The compact export omits those large arrays rather than presenting them as newly verified raw traces.
Absolute artifact paths are historical provenance, not portable prerequisites.
Older results have no total in-window read count; unavailable read throughput is not inferred from acknowledgments or final drain totals.

## Reproducing the Current Workloads

From the repository root, build the native artifacts with the existing receipt-producing script:

```bash
CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=/tmp/sea-unpaced-build \
	bash rust-service/scripts/build-benchmark-artifacts.sh
```

The benchmark server build includes `websocket-stream`, even when the selected workload uses WebTransport, because the runner also waits for the local WebSocket listener's startup marker.
Explicit `serverBinary` and `generatorBinary` paths can select preserved variants for comparisons; their provenance is the caller's responsibility.
The dataset records the original commands and hashes.

For the final memory-streamed configuration:

```bash
SEA_MAX_CONNECTIONS=128 \
SEA_EXPERIMENTAL_RESOURCE_POLICY=true \
SEA_EXPERIMENTAL_SESSION_FACTORY=false \
node rust-service/scripts/benchmark-stress.mjs run \
	'{"backend":"sea","generator":"native","loadMode":"streamed","transport":"webtransport","storage":"memory","liveCache":true,"payloadBytes":64,"documents":32,"cores":8,"generatorProcesses":8,"warmupSeconds":1,"seconds":8}' \
	/tmp/sea-unpaced-memory-sample
```

Use a new output directory for every repetition.
For the durable streamed case, select `"storage":"durable-file"` and add `"drainTimeoutSeconds":120`.
For acknowledgment pacing, select `"loadMode":"closed-loop"` and omit the streamed-only drain override.
The matched comparison used three repetitions per backend/mode/server variant; the separate-counter follow-up used three streamed-memory repetitions and one for each other cell.
The initial WebSocket campaign instead used three seconds warmup, ten seconds measured, and four generator processes, with a separate eight-generator memory control.

## Interpreting the Counters

- Write throughput counts application acknowledgments received in the measurement window.
- Read throughput sums validated application-event deliveries to all subscriptions in that same window, including writer echoes but excluding acknowledgments.
- Each of 32 documents starts with two subscriptions, for 64 in total.
  Shed subscriptions do not reconnect; writes continue if only the writer's read subscription is revoked.
- Warmup writes completed inside measurement count; completions during warmup or drain do not.
- Rates are not lifetime drain totals divided by measurement time.
  The two completion boundaries can differ slightly even without shedding.
- `shedReaders` counts distinct subscriptions over the full run, not concurrent readers or reconnects.
  `shedMissing` accounts for their undelivered suffixes; active readers must still drain exactly.
- The legacy `deliveredOperationsPerSecond` is observer-only and submission-cohort-based, not the new total read rate.

Default QUIC windows are unchanged.
The 120-second durable drain allowance is explicit and benchmark-only; the normal default remains 30 seconds.
The observed approximately 84-second durable drain does not demonstrate loss or a storage batch.
Reader shedding changes the workload, and successful loopback samples still exhibited packet loss.
No long-duration, high-RTT, production-capacity, or physical power-loss claim is made.
