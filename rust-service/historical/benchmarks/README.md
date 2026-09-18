# Retained Benchmark Evidence

This directory contains reviewed benchmark evidence grouped by workload and source commit. It is not an output directory for ad hoc runs.

## Layout

- `shared-tree/<commit>/README.md` records the environment, procedure, interpretation, and limitations for one retained run.
- JSON files next to that README contain the machine-readable observations described by the report.
- Optional subdirectories such as `cadence/` and `profile/` contain supporting measurements explicitly referenced by the run README.

The commit-named directories are provenance boundaries. Compare results only after checking their README files for workload, implementation, environment, schema, and known limitations. A matching filename across two commits does not by itself make the measurements comparable.

## Creating Evidence

Benchmark commands and output contracts are documented by the relevant harness.
For the Rust Sea harness, see [`../crates/sea-benchmarks/README.md`](../../crates/sea-benchmarks/README.md).
SharedTree evidence is produced by the benchmark tooling outside this directory and reviewed before retention.

Do not direct exploratory runs into this directory. Capture output elsewhere, verify its provenance and schema, add a run-specific README, and retain it through review. Existing payloads are historical evidence and must not be rewritten to match newer schemas or procedures.

## Validation

From `rust-service/`, validate grouping documentation and local links without reading or changing retained payload contents:

```bash
node scripts/check-documentation.mjs historical/benchmarks
```

This check verifies the grouping README and local Markdown links. Run-specific schema and domain invariants remain the responsibility of each retained run's README and producing benchmark workflow.
