# Iteration 0015: decorators Instructions

Derived from iteration: 0014
Status: planned
Owner: GitHub Copilot subagent

## Approved Scope

Independently verify iteration `0014` contract/test dispositions for `sea-compression`, `sea-encryption`, and `sea-stateful-compression` under the stricter owning-decision evidence rule approved by the serial plan and [Phase 3](../phase-3-report.md). Implement only confirmed, proportionate decorator-owned gaps.

## Prior Evidence

Use the applicable [quality inventory](../quality-inventory.md) rows, decorator [Phase 2 reports](../phase-2/), current source, tests, and history. Prior work distinguished wrapper transformations from shared session conformance and added focused retry and corrupt-replay evidence.

## Hypothesis and Discriminating Check

Hypothesis: an inherited adequate disposition may rely on conformance that can pass while a decorator-owned transformation, validation, or state decision is broken. Name that decision and nearest test, then check whether the wrapped implementation can mask it. A focused malformed-input, retry, or state-transition assertion that isolates the decorator falsifies the gap.

## Ownership and Dependencies

Writable: the three named decorator crate roots and assigned report. Read-only: all other paths. No dependency, manifest, lockfile, encoded-format, cryptographic-policy, dictionary, or shared API changes.

## Deliverables and Validation

Reassess every inherited row in scope, retain exact owning-decision/test evidence, and implement at most two unrelated repair clusters. Run focused tests, then format, strict Clippy, warning-denied rustdoc, and all-target/all-feature tests for all three crates, plus diff, lockfile, and ownership checks. Stop at format or security-policy changes and record them with revisit triggers.
