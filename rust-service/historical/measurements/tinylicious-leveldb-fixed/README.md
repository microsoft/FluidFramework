# Tinylicious LevelDB Repair and Measurements

These runs use `92ecf30f4a7d17db882cc39e7c60d8d19c1042ba` plus the uncommitted Tinylicious repair captured in each wrapper's `tracked.patch`.
The adapter now accepts the `checkpoints` collection, indexed by `_id`, and retains filter identity fields when an upsert inserts a new record.
The original blocked attempts remain separately in [the previous follow-up](../tinylicious-leveldb/README.md).
No default storage configuration or LevelDB synchronization option changed.

## Validation

- Tinylicious production and test TypeScript compilation passed.
- All 22 Tinylicious tests passed, including checkpoint insertion, service-field updates, identity isolation, deletion, and close/reopen persistence.
- The added test is ESLint-clean; package ESLint passed with existing warnings and no errors.
- Three 500 ops/s smoke/control runs passed: the initial repaired LevelDB smoke, followed by LevelDB and in-memory controls after the harness readiness correction.
- All 32 completed boundary runs ended with zero errors and zero missing deliveries.

The regression tests database reopen, not full service restart recovery or power-loss behavior.
The in-memory adapter's separate upsert semantics were not changed; the new checkpoint regression applies only to LevelDB.

## Measurements

The boundary workload uses 32 documents, four Node Socket.IO generators, one event per submission, three warmup seconds and ten measured seconds.
Payloads are 64 or 8,192 bytes.
Service affinity is CPU 2, CPUs 2,4,6,8, or CPUs 0,2,4,6,8,10,12,14; generators use CPUs 16,18,20,22.
Every cell starts a fresh service and documents, with LevelDB and Git summary files on workspace ext4.
The same host and thresholds as the [project overview](../../PROJECT_OVERVIEW.md) apply.

| Payload bytes | Service cores | Highest observed pass, ops/s | Higher observed failure, ops/s | Passing worst-worker p95, ms | Failing worst-worker p95, ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 64 | 1 | 250 | 500 | 8.51 | 108.79 |
| 64 | 4 | 900 | 950 | 87.52 | 115.89 |
| 64 | 8 | 900 | 950 | 89.40 | 120.53 |
| 8192 | 1 | 100 | 250 | 24.31 | 360.61 |
| 8192 | 4 | 100 | 250 | 10.55 | 148.68 |
| 8192 | 8 | 100 | 250 | 11.68 | 128.25 |

There are 33 boundary attempts: six threshold passes, 26 completed threshold failures, and one pre-load harness failure.
The failed startup checked LevelDB's `CURRENT` marker before the asynchronous database open completed.
The harness now verifies that marker after document creation and connection, before load; both database modes passed smoke checks afterward.
This failed attempt remains in the archive and summary, not counted as a capacity failure.

These are single observations, not repeated capacity brackets or isolated server ceilings.
The gaps below the failing rates were not exhaustively searched, and no conclusion about monotonic capacity is implied.
Backlog trend is not part of the threshold flag.
File-backed LevelDB does not imply synchronized durable acknowledgment; its writes do not explicitly request synchronous persistence.
The presentation's other columns and source counts remain pinned to the earlier revision, not silently recomputed with this repair.

## Evidence

[summary.json](summary.json) contains every raw result, derived table rows, run metadata, source/build hashes, and archive metadata.
`raw-evidence.tar.gz` contains 140 files: matrices, wrapper records and tracked patches, manifests, cell results, and logs.
All archived files were compared byte-for-byte against their original hashes before cleanup.
Disposable LevelDB and Git runtime directories are excluded; the three retained files avoid a large loose evidence tree.

Archive SHA-256: `d3f35cb08ce484f0da4e8d6d1c7e55326f094c3e4a9950dddfb51a4c71ae559c`.

To inspect or reproduce a campaign, extract the archive into a scratch directory.
Use its wrapper `run.json` for the original command and environment, and its matrices for the exact configurations.
Rebuild Tinylicious with the recorded repair before running the collector; compiled adapter hashes are recorded in the summary.
Choose fresh output directories and preserve the workspace-backed storage placement.