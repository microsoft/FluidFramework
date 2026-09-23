# Decision 0010: Proportional Iteration Workflow

Status: accepted
Date: 2026-09-13
Iteration: none; lightweight follow-up after `0010`
Owners: User and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The numbered iteration workflow provides isolation, parallel workstream ownership,
integration boundaries, normalized reports, and Phase 3 synthesis. Iteration
`0010` had one sequential workstream, so creating kickoff records, separate
integration and implementation worktrees, integration records, Phase 3 records,
and cleanup added coordination cost without parallelism or meaningful merge risk.

## Decision Drivers

The project should retain the ability to run multiple agents safely in parallel,
preserve durable research evidence, avoid process ceremony that does not improve
correctness, and leave the workflow choice under user control when a full
iteration could be useful but was not requested.

## Options and Evidence

Always using numbered iterations gives every task uniform records, but iteration
`0010` demonstrated disproportionate overhead for one sequential benchmark
correction. Always using direct work would reduce overhead but lose useful
isolation and synthesis for concurrent or integration-heavy research. A routed
workflow preserves both capabilities.

## Decision

Use lightweight direct work on the current branch for one-owner sequential tasks
that do not benefit from independent workstreams, an integration branch, or a
distinct implementation-to-synthesis boundary. Preserve evidence through focused
commits, tests, and the most local applicable report, benchmark README, decision,
or learning entry.

Use a full numbered iteration when multiple genuinely independent workstreams,
parallel execution, ownership or integration risk, normalized multi-input
reports, or an immutable Phase 2 boundary provides material value. One sequential
workstream alone does not justify an iteration.

Honor an explicit user choice. If a full iteration may provide material value but
the user did not specifically request one, explain the concrete benefits and
overhead of both workflows and ask the user which to use before creating
iteration records, branches, or worktrees. If that value emerges during
lightweight work, ask before converting it.

## Consequences

Small fixes, profiles, measurements, documentation changes, and focused
experiments can proceed with less ceremony. Parallel research retains the full
worktree, reporting, integration, and Phase 3 process. Records are no longer
uniform across every task, so lightweight work must still keep evidence in a
local durable artifact when the result needs retention. Existing iteration
records remain append-only and unchanged.

## Validation and Follow-Up

The workflow-selection gate is reflected in `rust-service/PLAN.md`,
`rust-service/README.md`, `rust-service/iterations/README.md`, and the
`rust-service-coordination` skill. Reconsider if lightweight tasks repeatedly lose
important evidence, or if full iterations repeatedly provide measurable value
for single sequential workstreams.
