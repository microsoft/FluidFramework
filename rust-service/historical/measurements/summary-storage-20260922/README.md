# Fluid Summaries and Persisted Storage, 2026-09-22

This dataset supports the [project overview](../../PROJECT_OVERVIEW.md#summary-and-cold-load-measurement-campaign-2026-09-22).
It contains 72 successful fresh-document samples at `1386a1abe3f6130c026fd820dff3d673bcb4c55c`, with benchmark-only working-tree changes.
No production service code was changed.

## Evidence

- [Manifest](manifest.json): collection source, working-tree status, configuration, and SHA-256 hashes of the measured script, release server, generated WASM, and Tinylicious LevelDB adapter.
- [Samples](samples.json): all timing results, summary shape, persistence checks, snapshot fingerprints, per-phase apparent/allocated file totals, machine metadata, and Tinylicious checkpoint-error counts.
- [Aggregates](aggregate.json): per-cell medians, minima, and maxima; three independent documents per cell.

The collection-time script hash predates the added `report` command, final formatting, and repository-standard header.
Those post-collection changes do not modify the measured worker or service lifecycle.

Each sample's `files` field is compacted to a count and hash of its original per-file inventory.
Full inventories and service/client logs remain in the machine-local `/tmp/summary-campaign-20260922-v2/` directory; those temporary artifacts are not required to read the retained totals.
The paths recorded in samples identify collection-time outputs, not portable repository locations.

## Reproduce

See the [runner setup](../../../scripts/README.md#summary-and-cold-load-setup) for build requirements, affinity, and measurement boundaries.
Run from the repository root:

```bash
node rust-service/scripts/benchmark-summaries.mjs campaign \
	'{"repetitions":3}' /tmp/new-summary-campaign
node rust-service/scripts/benchmark-summaries.mjs report \
	/tmp/new-summary-campaign /tmp/new-summary-report
```

The fixture contains eight SharedMaps with 32 or 512 deterministic 1,024-byte values each.
Each sample attaches prepopulated state, acknowledges a full baseline, edits one key, requests a full or incremental summary, and appends 200 operations.
The matrix crosses two summary modes, two sizes, two entropy profiles, and three file backends, rotating backend order over three repetitions.
Each download and cold load has a fresh service and client process; the OS page cache is not cleared.
All snapshot blobs match a pre-restart fingerprint, every map entry matches expected content, and all 200 tail operations are independently retrieved from persisted delta storage.

The `hash` fixture is labeled **Pseudorandom hex text** in the report: deterministic hexadecimal output generated from SHA-256 hashes.
Its 16-character alphabet remains compressible; this is not an incompressible-random-data fixture.
The command-line option and recorded dataset identifier remain `hash` for reproducibility.
The `repeated` fixture uses distinct index prefixes and repeated padding.
Fluid op compression and grouped batching are disabled; client GC remains at its default.
No SEA compression decorator is configured.
Tinylicious Git applies its normal object compression.

## Qualifications

These are single-host loopback stack measurements, not equal-durability or production capacity tests.
Server startup and client module imports are outside timings; lazy WASM startup is inside the read timings.
Download includes all unique blobs, eight concurrent reads, and hashing; cold load includes DDS realization and replay but excludes subsequent assertions.
Upload excludes summary generation and acknowledgment; `summarizeMilliseconds` includes both.
Filesystem totals exclude directory allocation and do not measure physical-device writes.
Live phase differences can include background work; stopped totals are separately retained.
No controlled compaction or steady-state storage experiment was performed.

Tinylicious's shredded-summary driver does not implement `downloadSummary`, so the comparison uses common snapshot-tree/blob APIs.
The summary-only read pins the acknowledged client summary; latest-document loading can read a later Tinylicious service summary containing log-tail operations.
Tinylicious LevelDB emitted the existing Scribe `Collection.deleteMany: Method not implemented` checkpoint-cleanup error in every retained sample.
Persistence checks passed, but a healthy cleanup/retention implementation is not established.
Small sample counts and background LevelDB rewriting limit storage-ratio conclusions.

## Unsuccessful Collection

The first collection at `/tmp/summary-campaign-20260922/` produced two successful Sea samples and stopped on the first Tinylicious sample.
SIGTERM interrupted an in-flight disconnect-triggered service summary; internal HTTP writes retried against the shutting-down endpoint, and the 10-second stop bound expired.
This was an invalid shutdown procedure for the intended orderly-restart measurement, not an accepted performance sample.
The runner now waits for a successful service-summary record whose sequence covers the known tail before shutdown.
A targeted 200-op rerun passed, then the separate 72-sample campaign passed.
The timeout was not increased, and the original attempt was not overwritten.
The earlier startup probe also exposed a missing required `SEA_WEBSOCKET_ORIGINS` setting, corrected before measurement.
An initial Tinylicious read expected latest-summary identity to equal the client acknowledgment; its later service summary falsified that assumption, leading to explicit version pinning for the summary-only read.

## Validation

The six-case smoke matrix and all 72 retained samples passed their runtime assertions.
An independent retained-data audit confirmed 24 cells, all 72 matching snapshot fingerprints, zero handles in full mode, nine handles in incremental mode, and 14,400 verified persisted operations.
Repository Biome checks, Rust-service policy checks, and documentation-link checks passed.
Canonical Cargo formatting, strict workspace Clippy, strict rustdoc, and the workspace all-target build passed.

The first workspace test run failed the already-documented `host::tests::native_client_round_trip_in_every_storage_mode` timeout in durable-file mode after 5.706 seconds.
The reported server counters were 103 wire bytes, one active connection, one peak stream, and zero cleanups.
The focused test passed, followed by a complete workspace all-target/all-feature retry: 202 passed, zero failed, one browser-harness test ignored.
This does not resolve the [known native timeout](../../../KNOWN_ISSUES.md#intermittent-native-connection-timeout).
The browser-wide `test.sh` suite was not rerun for this standalone Node benchmark and documentation change.
No registered package build input or production API changed, so no root package build or changeset was required.