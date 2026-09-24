# Project Overview Refresh, 2026-09-24

This dataset supports the current measurements in the [project overview](../../PROJECT_OVERVIEW.md).
The refreshed measurements use commit `dfadc07d6e03afa2bf55795d669fdf3e60901d20`.

## Retained Evidence

[`campaign-summary.json.gz`](campaign-summary.json.gz) retains:

- source and dependency inventories;
- repeated stress aggregates and ranges;
- all browser aggregates and ranges;
- every capacity attempt and the derived pass/failure brackets;
- all 24 summary and cold-load aggregate cells;
- exact revision and host metadata;
- Sea end-to-end test totals and the unchanged Tinylicious totals from the 2026-09-23 campaign.

SHA-256: `307387884f8d8b54304439fcda2f14c929e670bf62616db67d44ed5a55736415`.

Inspect the compact JSON with:

```bash
gzip -dc campaign-summary.json.gz | jq .
```

Raw logs and per-process samples are retained outside the repository in the session evidence directory.
The compact dataset contains all values used by the overview but is not a substitute for those raw diagnostics.

## Campaign Scope

- 180 primary repeated stress attempts and 11 bounded replacements.
- 136 capacity probes across 30 service, storage, payload, and core rows.
- 160 passing browser samples: ten repetitions for eight paths and two DDS modes.
- 72 passing summary, download, cold-load, and persisted-size samples.
- Complete current Sea end-to-end and source inventories.
- Unchanged production dependency counts and Tinylicious end-to-end totals from the 2026-09-23 campaign.

The first native repeat attempt used a stale staged generator executable and is excluded.
The accepted rerun used matching server and generator binaries.
One browser group and the summary campaign recorded a dirty worktree only because the project overview was being updated during collection.
The executable source and built artifacts remained at the recorded revision.

## Environment and Storage

The host reported AMD EPYC 7763, Linux `6.8.0-1064-azure`, Node.js `22.23.2`, Rust `1.98.1`, and 32 logical CPUs.
Sea and Tinylicious file-backed data used owned directories directly under `/tmp`.
The recorded filesystem was ext4 on `/dev/sdb1[/containerTmp]`; the workspace remained on `/dev/loop4[/codespacemount/workspace]`.
Every sample recorded its exact temporary path and removed that path after collection.

These are short, single-host loopback measurements.
They do not establish production capacity, equal durability, physical power-loss behavior, or confidence intervals.
