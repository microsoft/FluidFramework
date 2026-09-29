# Iteration 0020: foundations Instructions

Status: active
Branch: `rust-service-iteration-0020-foundations`
Iteration source commit: `8a3889518d537d6a85bd55cc31a1b7404eee78e7`
Owner: foundations agent
Report: `rust-service/historical/iterations/0020/phase-2/foundations.md`
Required environment: pinned Rust 1.98.1; Node.js for documentation checks.

## Assignment

Audit all incremental consequential boundaries in sea-core, sea-file, sea-memory, sea-content-addressed, and sea-conformance since `8bd1e64ebfa`.
Prioritize policy/factory contracts, pressure notification and release, storage recovery/publication, and capability forwarding.
Use the [charter](../../charter.md) and inherited inventory.
Hypothesis: changed owning decisions may lack precise contracts or focused discriminating evidence.
Review every assigned member; do not substitute a fixed boundary sample.

## Ownership

Writable: the five assigned crate directories and this workstream's report.
Dependencies and other records are read-only.
No shared fixture changes are preauthorized; request cross-owner changes from the coordinator.

## Terminal Access

Loaded workspace: `/workspaces/FluidFramework`.
Assigned process tasks: `sea-0020-foundations-probe`, `sea-0020-foundations-format`, and `sea-0020-foundations-check`.
The coordinator supplies the external guarded runner and worktree path at dispatch.
Probe actual task invocation before relying on autonomous checks.
Logs use fresh run directories under the coordinator's session files.
No shared foreground shell ownership is assigned.
If task access fails, return commands and pause edits for coordinator validation; do not use shell execution as a workaround.

## Expected Evidence

Complete report with a crate coverage map and one disposition per consequential reviewed boundary.
Quote/link precise contracts, identify owning decisions and nearest focused test names, and distinguish each broader evidence layer.
Repair localized material gaps only; a no-change outcome is valid.
Record limitations and revisit triggers, not speculative defects.

## Validation

Use the development guide's affected-crate checks and assigned guarded tasks.
Return focused selectors immediately after each repair batch.
Do not modify lockfiles.
Liveness mutations require an exact passing baseline test and an external deadline; restore and rerun before proceeding.
The coordinator runs final applicable integration gates.

## Escalation and Stopping Conditions

Finish all assigned incremental coverage without a time or boundary cutoff.
Escalate shared semantic choices, redesigns, tooling blockers, and cross-owner findings.
Do not stop reviewing when a repair is blocked.
Return a frozen diff/report for coordinator validation and commit; do not commit through an unassigned terminal.

## Reporting Requirements

Use the generated report with actual kickoff/worktree provenance and unknown metadata explicitly marked.
Record events while working.
Follow the quality skill's evidence criteria; do not launch nested agents.
