# Iteration 0015: workloads Instructions

Status: planned
Branch: `rust-service-iteration-0015-workloads`
Iteration source commit: `ff7d736642c2711b44ce0507b2319c188ff46129`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0015/phase-2/workloads.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, result-schema, workload-definition, or production API changes

## Assignment

Independently verify inherited dispositions for `sea-benchmarks` and `sea-counter`. The hypothesis is that successful execution may not detect an incorrect workload-owned oracle, completion condition, or demonstration claim. Challenge each inherited row by naming the exact decision and constructing the smallest wrong result its nearest test must reject.

## Ownership

Writable: `rust-service/crates/sea-benchmarks/`, `rust-service/examples/sea-counter/`, and this report. Read-only: production dependencies and iteration `0014` evidence. Do not change dependencies, manifests, lockfiles, schemas, workloads, or production APIs.

## Expected Evidence

Reassess every inherited row, retain exact oracle/test mappings, update inventory rows, and implement at most two unrelated repair clusters. A no-change result requires a focused oracle or executable assertion that rejects the relevant wrong result. No machine-readable output is retained.

## Validation

Guard checkout identity. Run focused tests after edits, then package format, strict Clippy, warning-denied rustdoc, all-target/all-feature tests, benchmark smoke, `cargo run -p sea-counter`, diff, lockfile, and ownership checks.

## Escalation and Stopping Conditions

Stop when all rows discriminate, after two unrelated repair clusters, or before measured semantics, schemas, workload definitions, production APIs, dependencies, or manifests change.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
