# Iteration 0020: transport Instructions

Status: active
Branch: `rust-service-iteration-0020-transport`
Iteration source commit: `8a3889518d537d6a85bd55cc31a1b7404eee78e7`
Owner: transport agent
Report: `rust-service/historical/iterations/0020/phase-2/transport.md`
Required environment: pinned Rust 1.98.1.

## Assignment

Audit all incremental consequential boundaries in sea-webtransport and sea-webtransport-server since `8bd1e64ebfa`.
Prioritize typed hosting/protocol ownership, pipelined admission/receipts, configuration defaults, scheduling, deadlines, and stream/session lifecycle.
Use the [charter](../../charter.md) and inherited inventory.
Hypothesis: changed owning decisions may lack precise contracts or focused discriminating evidence.
Review both crates completely for incremental relevance, not only their newest diff.

## Ownership

Writable: both assigned crate directories and this workstream's report.
Dependencies, root guides, browser harness, and other records are read-only.
Request cross-owner repairs through the coordinator.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned tasks: `sea-0020-transport-probe`, `sea-0020-transport-format`, and `sea-0020-transport-check`.
The coordinator supplies a guarded runner and worktree path.
Probe actual task invocation; logs use fresh directories under coordinator session files.
No shared foreground shell ownership is assigned.
If task access fails, return commands and pause edits for coordinator validation.

## Expected Evidence

Complete report with both crates' incremental coverage, precise contracts, owning decisions, focused test discriminators, and dispositions.
Distinguish deterministic local checks from native/browser platform boundaries.
Repair localized confirmed gaps; record failures without retrying them away.
Do not treat unresolved overload benchmark failures as proven product bugs.

## Validation

Use affected-crate checks from the development guide and guarded tasks.
Return focused test selectors after each repair batch.
No lockfile changes.
Liveness mutations need exact passing baseline, external timeout, restoration, and rerun.
The coordinator owns extended integration/browser validation.

## Escalation and Stopping Conditions

Complete all incremental coverage without a fixed cutoff.
Escalate shared semantics, redesigns, cross-owner findings, and tooling blockers.
Return frozen changes/report for coordinator validation and commit.
Do not commit through an unassigned terminal.

## Reporting Requirements

Use the generated report with actual kickoff/worktree provenance.
Record events and limitations contemporaneously.
Follow quality-skill evidence criteria; do not launch nested agents.
