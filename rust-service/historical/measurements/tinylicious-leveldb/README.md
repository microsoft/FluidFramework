# Tinylicious LevelDB Follow-up

This follow-up adds the file-backed Tinylicious configuration to the [project overview](../../PROJECT_OVERVIEW.md).
It ran at `92ecf30f4a7d17db882cc39e7c60d8d19c1042ba` on 2026-09-20 UTC with harness-only configuration changes; Tinylicious implementation and built artifacts were not modified.

## Result

All six LevelDB attempts failed before load generation with `Collection checkpoints not implemented.` from `LevelDb.getProperty`, called while connecting the document orderer.
The tested combinations were 64-byte and 8,192-byte payloads on one, four, and eight service cores, with planned rates of 950 small or 800 large operations/s.
These are not throughput measurements, and no passing/failing capacity bracket can be inferred.
The initial four-core, 500-small-op smoke reproduced the same error.
An explicit in-memory control at 500 small ops/s passed, delivering 500 ops/s with zero errors or missing deliveries.

The harness selects LevelDB using `db__inMemory=false` and `db__path=<cell>/tiny-db`, while Git summaries use `<cell>/tiny-storage`.
It verified the LevelDB `CURRENT` marker before starting workers in every LevelDB attempt and its absence in the memory control.
Database and summary paths were fresh per process on workspace ext4, not `/tmp`.
Workload settings remained 32 documents, one writer/observer pair each, four generator cores at CPUs 16,18,20,22, three-second warmup, and ten measured seconds.
No LevelDB run reached those timed phases; smoke/control timing was one warmup and three measured seconds.
Service CPU sets remained 2; 2,4,6,8; and 0,2,4,6,8,10,12,14.
Node Routerlicious Socket.IO clients and unencrypted loopback transport were unchanged.

Repairing Tinylicious's checkpoint-collection compatibility is outside this measurement-only follow-up.
Even after that repair, file-backed storage alone does not establish acknowledgment durability equivalent to Sea durable-file; the current LevelDB adapter does not explicitly request synchronous persistence on its writes.

## Evidence

- [summary.json](summary.json) records all six configurations and failures, smoke/control results, exact campaign command/environment, harness and binary hashes, and Tinylicious source/build/configuration hashes.
- [raw-evidence.tar.gz](raw-evidence.tar.gz) contains 28 original files: matrices, manifests, result aggregates, raw results, service logs, runner logs, and wrapper records including the tracked patch.

Archive SHA-256: `e33dbf96850b683a5ef7fd8e68ea11e949e979842feb05ef161642967827c154`.
Every member was extracted and hash-checked before its loose original was removed.
Fifteen disposable database/summary directories were removed after the processes stopped; no historical evidence was changed.
Retained JSON formatting was checked for semantic equality.
Extract with `tar -xzf raw-evidence.tar.gz -C /path/to/scratch`; paths are relative to this evidence directory.
The `campaign/run.json` command and `matrix.json` reproduce the attempted matrix with a fresh output location.
Collector exit status zero means all attempts were recorded, not that they succeeded.

The harness's Biome checks passed, the memory control passed, and every matrix entry was reconciled with its raw result and LevelDB failure log.
No Rust or Tinylicious implementation change was needed or made.