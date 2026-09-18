# Iteration 0015: core-session Instructions

Derived from iteration: 0014
Status: planned
Owner: GitHub Copilot subagent

## Approved Scope

Independently verify the `already adequate` and repaired contract/test dispositions for `sea-core`, `sea-conformance`, and `sea-sequencer` under the stricter owning-decision evidence rule approved by the serial quality plan and [iteration 0014 Phase 3](../phase-3-report.md). Implement only confirmed, proportionate gaps within these crates.

## Prior Evidence

Use the corresponding rows in [the iteration 0014 quality inventory](../quality-inventory.md), all three [Phase 2 reports](../phase-2/), and current code and history. Iteration `0014` found useful repairs but independent process review found that topical or shared evidence can be accepted without proving the exact owning decision.

## Hypothesis and Discriminating Check

Hypothesis: at least one inherited adequate disposition may lack a caller-facing contract or a test that fails when only its owning implementation decision regresses. For each row, name that decision and nearest test, then check whether another implementation or component could satisfy the test while the target behavior is broken. A precise existing test that cannot be masked falsifies the gap.

## Ownership and Dependencies

Writable: `rust-service/crates/sea-core/`, `rust-service/crates/sea-conformance/`, `rust-service/crates/sea-sequencer/`, and the assigned report. Read-only: all other paths. No dependency, manifest, lockfile, durable-format, or cross-scope changes. Shared semantic changes require Phase 3 review.

## Deliverables and Validation

Produce disposition updates for every inherited row in scope, exact owning-decision/test analysis, and at most two unrelated repair clusters. Follow the quality skill and report template. Run focused tests after edits, then format, strict Clippy, warning-denied rustdoc, and all-target/all-feature tests for the three packages, plus diff, lockfile, and ownership checks. Stop when all inherited dispositions have discriminating evidence or a recorded material gap, or at the two-cluster budget.
