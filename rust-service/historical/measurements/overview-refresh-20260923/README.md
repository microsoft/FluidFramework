# Project Overview Refresh, 2026-09-23

This dataset supports the current measurements in the [project overview](../../PROJECT_OVERVIEW.md).
The primary campaign used clean commit `240798434cf591f4db2366a1a3b6b6a7438bd015`.
The complete summary campaign used `22309cf9d169c4f7986b6ce1db184427269f9656`, whose only intervening change makes point-in-time file inventory tolerate atomic temporary-file renames.
It does not change the service, client, workload, timing boundary, or persistence behavior.

## Retained Evidence

[`campaign-summary.json.gz`](campaign-summary.json.gz) retains:

- source and dependency inventories;
- all repeated stress aggregates and ranges;
- all browser aggregates and ranges;
- every capacity attempt and the derived pass/failure brackets;
- all 24 summary/cold-load aggregate cells;
- exact revisions, host metadata, filesystem identity, and end-to-end test totals.

SHA-256: `d95f52203f470675b04085089af74fb23626909dbff0ebebbe0ab922969ef18e`.

The uncompressed JSON is approximately 2,600 lines.
Inspect it with:

```bash
gzip -dc campaign-summary.json.gz | jq .
```

Raw logs and per-process samples are retained outside the repository in the session evidence directory.
The compact dataset contains all values used by the overview but is not a substitute for those raw diagnostics.

## Campaign Scope

- 80 matched-load and Node/WASM stress attempts, plus 20 bounded replacement attempts.
- 100 native Sea transport and Tinylicious stress attempts.
- 135 capacity probes across 30 service/storage/payload/core rows.
- 160 passing browser samples: ten repetitions for eight paths and two DDS modes.
- 72 passing summary, download, cold-load, and persisted-size samples.
- Complete Sea and Tinylicious end-to-end test inventories.
- Current source and production dependency inventories.

Sea's primary results use the default-enabled live cache.
Cache-disabled results are diagnostic controls and are not mixed into the overview tables.
Eight-core Sea capacity probes use eight generator processes on separate physical CPUs.

## Environment and Storage

The host reported AMD EPYC 9V74, Linux `6.8.0-1064-azure`, Node.js `22.23.2`, Rust `1.98.1`, and 32 logical CPUs.
Sea and Tinylicious file-backed data used owned directories directly under `/tmp`.
The recorded filesystem was ext4 on `/dev/sda1[/containerTmp]`; the workspace remained on `/dev/loop4`.
Every sample recorded its exact temporary path and removed that path after collection.

These are short, single-host loopback measurements.
They do not establish production capacity, equal durability, physical power-loss behavior, or confidence intervals.
