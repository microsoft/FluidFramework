# Iteration 0016: contract-locality Instructions

Derived from iteration: 0015
Status: planned
Owner: GitHub Copilot subagent

## Approved Scope

Independently verify all iteration `0015` `already adequate` dispositions under the refined contract-traceability and diagnostic-locality rule approved by the serial quality plan and [Phase 3](../phase-3-report.md). Implement at most two confirmed, proportionate gaps anywhere in the Rust workspace.

## Prior Evidence

Use [the iteration 0015 quality inventory](../quality-inventory.md), its five [Phase 2 reports](../phase-2/), current contracts, tests, consumers, and history. Iteration `0015` showed that exact failure discrimination catches masked evidence, while process review found that an assertion can still leave the promise implicit or diagnosis remote from the implementation owner.

## Hypothesis and Discriminating Check

Hypothesis: at least one inherited adequate disposition lacks either precise contract text promising the relied-upon behavior or a practical owner-local test that diagnoses the implementation even though shared evidence eventually fails. For each row, quote or link the contract text, name the owning decision, and compare the nearest local assertion with shared conformance or integration evidence. Precise text plus a focused local assertion falsifies the gap.

## Ownership and Dependencies

Writable: Rust crate roots and the assigned report. Read-only: generated artifacts, non-Rust test packages, iteration history, and application/browser consumers. No dependency, manifest, lockfile, format, wire, security-policy, durability-policy, or shared semantic changes. Any cross-crate contract clarification must remain consistent with implemented and tested behavior.

## Deliverables and Validation

Challenge every inherited adequate row and retain a compact evidence table. Implement at most two unrelated clusters, each with precise contract text and a deterministic owner-local test when practical; retain conformance and broader tests for distinct responsibilities. Run focused checks, workspace format, strict Clippy, warning-denied rustdoc, all-target/all-feature workspace tests, docs, diff, lockfile, and ownership checks. Stop when all rows satisfy both requirements, at two clusters, or at an excluded semantic/platform/fault boundary.
