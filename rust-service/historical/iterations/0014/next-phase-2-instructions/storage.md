# Iteration 0015: storage Instructions

Derived from iteration: 0014
Status: planned
Owner: GitHub Copilot subagent

## Approved Scope

Independently verify iteration `0014` contract/test dispositions for `sea-content-addressed`, `sea-memory`, `sea-file`, and `sea-file-durable` under the stricter owning-decision evidence rule approved by the serial plan and [Phase 3](../phase-3-report.md). Implement only confirmed, proportionate gaps within these crates.

## Prior Evidence

Use the applicable [quality inventory](../quality-inventory.md) rows, storage [Phase 2 reports](../phase-2/), current source, tests, and history. Prior work repaired several atomicity and recovery gaps while retaining explicit fault-seam and durability deferrals.

## Hypothesis and Discriminating Check

Hypothesis: an inherited adequate storage disposition may cite a broad law or adjacent test that does not fail when only the backend-owned mutation, recovery, or validation decision regresses. Name the decision and nearest test, then check whether another backend or shared fixture can mask it. Direct focused evidence falsifies the gap.

## Ownership and Dependencies

Writable: the four named crate roots and assigned report. Read-only: all other paths. No dependency, manifest, lockfile, persistence-format, durability-policy, or shared API changes. Use disposable storage roots and remove them.

## Deliverables and Validation

Reassess every inherited row in scope, retain exact owning-decision/test evidence, and implement at most two unrelated repair clusters. Run focused tests, then format, strict Clippy, warning-denied rustdoc, and all-target/all-feature tests for all four crates, plus diff, lockfile, ownership, and temporary-artifact checks. Preserve unresolved fault-seam work unless new deterministic evidence makes repair practical.
