# Iteration 0015: core-session Instructions

Status: planned
Branch: `rust-service-iteration-0015-core-session`
Iteration source commit: `ff7d736642c2711b44ce0507b2319c188ff46129`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0015/phase-2/core-session.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, durable-format, or shared-semantic changes

## Assignment

Independently verify the inherited `sea-core`, `sea-conformance`, and `sea-sequencer` contract/test dispositions under the exact owning-decision evidence rule. The hypothesis is that at least one adequate disposition may lack a caller-facing contract or test that fails when only its owning implementation decision regresses. Challenge every inherited row; direct discriminating evidence falsifies each proposed gap.

## Ownership

Writable: the three named crate roots and this report. Read-only: all other paths, iteration `0014` records, consumers, and implementations outside scope. Do not change dependencies, manifests, lockfiles, durable formats, or shared semantics without escalation.

## Expected Evidence

Reassess every inherited row in scope, naming the exact owning decision and nearest test that fails if only it regresses. Produce inventory updates and at most two unrelated repair clusters. For changes, document consumer-required behavior and add focused owning-crate evidence; conformance remains for shared laws. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard absolute path, branch, kickoff, and status. Run focused checks after edits. Finish with workspace format, strict Clippy, warning-denied rustdoc, and all-target/all-feature tests for `sea-core`, `sea-conformance`, and `sea-sequencer`, plus `git diff --check`, unchanged `Cargo.lock`, and writable-path validation.

## Escalation and Stopping Conditions

Stop when all inherited rows discriminate, after two unrelated repair clusters, or at shared semantic, cross-scope, format, dependency, or manifest changes. Preserve unresolved contract questions and exact revisit triggers.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
