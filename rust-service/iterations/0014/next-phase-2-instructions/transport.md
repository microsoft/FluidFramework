# Iteration 0015: transport Instructions

Derived from iteration: 0014
Status: planned
Owner: GitHub Copilot subagent

## Approved Scope

Independently verify iteration `0014` contract/test dispositions for `sea-webtransport` and `sea-webtransport-server` under the stricter owning-decision evidence rule approved by the serial plan and [Phase 3](../phase-3-report.md). Implement only confirmed, proportionate transport-owned gaps.

## Prior Evidence

Use the applicable [quality inventory](../quality-inventory.md) rows, both transport [Phase 2 reports](../phase-2/), current source, tests, generated Node evidence, and history. Prior work repaired optional injected disconnect and snapshot-stream cleanup while retaining browser and handshake deferrals.

## Hypothesis and Discriminating Check

Hypothesis: an inherited adequate transport disposition may cite endpoint, fresh-client, protocol, generated, or browser coverage that can pass while one connection-, stream-, or adapter-owned decision is broken. Name the exact decision and nearest test, then check whether a sibling component or fresh connection can mask it. An isolated deterministic test at the narrowest practical boundary falsifies the gap.

## Ownership and Dependencies

Writable: both named transport crate roots, `rust-service/tests/wasm-client/` when generated Node evidence is the narrowest practical boundary, and assigned report. Read-only: browser and other consumer paths. No dependencies, manifests, lockfiles, wire formats, generated artifacts, TLS policy, or shared API changes. Stop all endpoints.

## Deliverables and Validation

Reassess every inherited row in scope, retain exact owning-decision/test evidence, and implement at most two unrelated repair clusters. Run focused Rust or generated Node tests after edits, then both packages' format, strict Clippy, warning-denied rustdoc, all-target/all-feature tests, WASM target check, generated Node suite when applicable, diff, lockfile, process, generated-artifact, and ownership checks. Browser-only and stalled-handshake work remains deferred absent a deterministic fixture.
