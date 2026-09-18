# Iteration 0015: workloads Instructions

Derived from iteration: 0014
Status: planned
Owner: GitHub Copilot subagent

## Approved Scope

Independently verify iteration `0014` contract/test dispositions for `sea-benchmarks` and `sea-counter` under the stricter owning-decision evidence rule approved by the serial plan and [Phase 3](../phase-3-report.md). Implement only confirmed, proportionate workload-owned gaps.

## Prior Evidence

Use the applicable [quality inventory](../quality-inventory.md) rows, both workload [Phase 2 reports](../phase-2/), current source, executable checks, and history. Prior work repaired payload verification and snapshot-disabled recovery while accepting the example as adequate.

## Hypothesis and Discriminating Check

Hypothesis: an inherited adequate workload disposition may cite successful execution that cannot detect an incorrect workload-owned oracle, completion condition, or demonstration claim. Name the exact decision and nearest test, then inject or construct the smallest wrong result that should fail. A focused oracle test that rejects it falsifies the gap.

## Ownership and Dependencies

Writable: `rust-service/crates/sea-benchmarks/`, `rust-service/examples/sea-counter/`, and assigned report. Read-only: production dependencies and other paths. No dependency, manifest, lockfile, result-schema, workload-definition, or production API changes.

## Deliverables and Validation

Reassess every inherited row in scope, retain exact owning-decision/test evidence, and implement at most two unrelated repair clusters. Run focused tests, package format, strict Clippy, warning-denied rustdoc, all-target/all-feature tests, benchmark smoke, `sea-counter`, diff, lockfile, and ownership checks. Stop before changing measured semantics or turning the example into a broad integration suite.
