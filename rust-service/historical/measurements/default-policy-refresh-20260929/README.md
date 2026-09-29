# Default-Policy Overview Refresh, September 29, 2026

This dataset supports the current [project overview](../../PROJECT_OVERVIEW.md).
It replaces the overview's historical threshold-search tables with repeated saturation measurements, while retaining matched-load efficiency, browser, summary, source, dependency, and Sea end-to-end results.

## Measured Implementation

The measured working tree is based on `19777f37055dfbdedec03a7418dd70956524f939`, with the executable resource policy changed from opt-in to default-on and a new Tinylicious pipelined generator.
It is not an unmodified measurement of that commit.
The author window defaults to 256 requests with the existing 4 MiB encoded-input limit.
Embedded hosts still select policy decorators explicitly.

- Server SHA-256: `bdd8c5151008edd1db4f1584f773722413d4219998c81feeade0360725039915`.
- Native generator SHA-256: `77c7b328b5881e74ee34ad79af4ecd53c0b6ebcc4c6751c0e7ffad6a8e9b61fe`.
- [`measured-source.json.gz`](measured-source.json.gz) contains the tracked source patch and new generator helper/test files.
- [`campaign-summary.json.gz`](campaign-summary.json.gz) contains the source/binary hash manifest, per-run compact results, aggregates, failures, browser samples, summary samples, source/dependency inventories, and validation totals.

Archive SHA-256 values:

- `campaign-summary.json.gz`: `b2e532e536267cae4e4f37ac8551702d2740e095fff14ea7bbc38de98463e6b8`.
- `measured-source.json.gz`: `718e28da318bd8889cd53f3fb45b745f29d20c9980bacdde8f678ac2e9205b6e`.

The native receipt, staged binaries, generated WASM, and tracked executable inputs were unchanged during collection.
Raw timestamp arrays, resource samples, process logs, and binaries remain in the originating session's `files/overview-defaults-20260929` evidence directory.
The compact archive retains raw-result hashes; absolute paths are provenance, not portable runtime dependencies.

## Scope and Outcomes

| Group | Attempts | Outcome |
| --- | ---: | --- |
| Sea streamed storage/core/payload matrix | 72 | 63 completed; nine failed |
| Tinylicious bounded pipelining | 12 | All completed with exact reader drain |
| Matched 500 operations/s | 12 | All passed offered-rate and integrity gates |
| Native acknowledgement-paced transports | 12 | All completed without shedding |
| Separate short memory follow-ups | 6 | All completed without shedding |
| Browser paths, two DDS modes | 48 | All passed final convergence |
| Summary and cold-load campaign | 72 | All passed persistence/content checks |
| Sea Fluid end-to-end tests | 691 passes | Zero failures; 493 pending |

No unsuccessful saturation attempt was replaced by a successful retry.
Six eight-core memory attempts at 4/8 KiB hit the unchanged 4 GiB RSS guard.
Separate one-second-warmup/four-second-measurement follow-ups show short-run rates, not sustainable retention or replacement results.
Three four-core 64-byte runs failed acknowledgement drain: two memory, one buffered.
Their worker errors include stream/connection termination and a timing-record limit.
Completed samples with explicit reader shedding retain the actual write/read rates and subscription outcomes.
Tinylicious summary samples retained 693 checkpoint-write errors; persistence assertions passed despite the existing cleanup problem.

## Workloads

Primary stress runs use 32 documents, two read subscriptions per document, two seconds warmup, 12 measured seconds, and three order-varied repetitions.
Sea streaming uses native WebTransport, eight separate generator cores, storage modes memory/buffered-file/durable-file, and one/four/eight service cores.
Payloads are 64 B and 8 KiB at every core count, plus 1 and 4 KiB at eight cores.
Sea streaming allows 120 seconds to drain; it does not count drain completions as measured throughput.

Tinylicious uses eight service and eight generator cores, memory/LevelDB, and 64 B/8 KiB payloads.
Its synchronous submission API does not expose awaitable transport capacity.
The benchmark adds 256 operation credits and 2 MiB of logical payload credits per generator, replenished by validated sequenced writer echoes.
This is not Sea-style transport backpressure and does not establish durable acknowledgements.
Observers do not replenish credits; both subscriptions must drain exactly.
The drain allowance is 30 seconds.

Matched-load runs use four service and four generator cores, memory storage, 64 B/8 KiB, and 500 offered operations/s.
Sea uses its production Node/WASM WebSocket client.
Native transport controls use the same four/four core allocation and one outstanding operation per document over WebSocket or WebTransport.

Browser runs use eight existing paths, dummy DDS and real SharedTree, three repetitions, 100 warmup edits and 1,000 measured edits.
They use one edit per turn without per-turn convergence waits and share CPUs `8,10,12,14,16,18,20,22`.
Summary workloads retain the full 72-sample matrix: two sizes, two entropy profiles, full/incremental modes, and Sea buffered/durable plus Tinylicious LevelDB.

## Defaults, Environment, and Reproduction

Resource policy and author-window environment overrides are unset for collection.
Sea startup logs confirm `EXPERIMENTAL_RESOURCE_POLICY=true` and `AUTHOR_WINDOW=256`.
The stress harness explicitly uses `SEA_MAX_CONNECTIONS=128`; live caching is enabled.
The default-on policy is for executable hosts, not an implicit change to local embedded browser paths.

All owned backend data directories are directly under `/tmp`, on ext4 `/dev/sda1[/containerTmp]`, device 2049.
They were removed after collection.
The host is AMD EPYC 7763, Linux `6.8.0-1064-azure`, Node.js `22.23.2`, Rust `1.98.1`, with 32 logical CPUs.
No builds, tests, or competing campaign samples ran during timed measurements.

Build current native and WASM/client artifacts using the [script guide](../../../scripts/README.md) before collection.
Representative commands, from the repository root, with fresh output directories:

```bash
SEA_MAX_CONNECTIONS=128 node rust-service/scripts/benchmark-stress.mjs run \
  '{"backend":"sea","storage":"durable-file","generator":"native","transport":"webtransport","loadMode":"streamed","documents":32,"cores":8,"generatorProcesses":8,"payloadBytes":64,"warmupSeconds":2,"seconds":12,"liveCache":true,"drainTimeoutSeconds":120}' \
  /path/to/new-sea-output

node rust-service/scripts/benchmark-stress.mjs run \
  '{"backend":"tinylicious","storage":"memory","loadMode":"pipelined","documents":32,"cores":8,"generatorProcesses":8,"payloadBytes":64,"warmupSeconds":2,"seconds":12,"maxOutstandingOperations":256,"maxOutstandingBytes":2097152,"drainTimeoutSeconds":30}' \
  /path/to/new-tinylicious-output

node rust-service/scripts/benchmark-summaries.mjs campaign \
  '{"repetitions":3}' /path/to/new-summary-output

taskset -c 8,10,12,14,16,18,20,22 \
  node rust-service/tests/sea-integration-tests/scripts/run-benchmark.mjs \
  --skip-build \
  --case rust-local-direct,rust-local,local,rust-memory,rust-memory-direct,rust-websocket,rust-websocket-direct,tinylicious \
  --dds dummy --workload turns --repetitions 3 --operations 1000 --warmup 100 \
  --no-synchronize-per-turn --artifact-dir /path/to/new-browser-output
```

Repeat the browser command with `--dds shared-tree`.
Inspect the archive with `gzip -dc campaign-summary.json.gz | jq .`.
Configuration objects and collection scripts in the archive define the exact remaining cells and ordering.
Three repetitions and short local runs provide observations, not confidence bounds, long-duration capacity, or equal persistence guarantees.
