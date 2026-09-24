# Iteration {{NEXT_ITERATION}}: {{WORKSTREAM}} Instructions

Derived from iteration: {{ITERATION}}
Status: planned
Owner: <!-- TODO(required): record the agent or owner -->

## Approved Scope

<!-- TODO(required): state the user-approved scope and link the Phase 3 decision -->

## Prior Evidence

<!-- TODO(required): link the findings, decisions, tests, and measurements that motivate this workstream -->

## Hypothesis and Discriminating Check

<!-- TODO(required): state one falsifiable hypothesis and the cheapest check that can disprove it -->

## Ownership and Dependencies

<!-- TODO(required): list writable paths, dependencies, prerequisites, and forbidden shared changes. For shared fixtures, name the owner and authoritative coordinator handoff (source path, commit, and interface), or state none. -->

## Deliverables and Validation

Follow the coordination skill's Terminal Coordination section before dispatch.
Assign process task IDs and fresh per-run evidence paths; use compound tasks for parallel check batches and serialize only shared foreground terminal access by default.
Include a checkout-guarded formatter-write task scoped to owned crates or files.

- Verify actual delegate tool discovery (`tool_search` when required) and assigned registered-task invocation through `run_task` before promising autonomous edit/test loops.
- If only the coordinator has task access, plan parallel file audit/edit batches followed immediately by coordinator task validation before further edits; return attributable results and re-dispatch without requiring delegate foreground-terminal access or serializing whole workstreams.

<!-- TODO(required): list expected evidence, commands, reporting obligations, and stopping conditions. For behavior changes and bug fixes, require documentation of the relied-upon contract and proportionate focused regression evidence in each owning production crate, with conformance or broader integration coverage only where it proves a distinct responsibility; require rationale for omissions. If using liveness mutations, specify the owning-test selector and external deadline with bounded termination; follow the coordination skill's baseline, restoration, and rerun requirements. -->
