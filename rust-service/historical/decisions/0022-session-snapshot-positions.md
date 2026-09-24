# Decision 0022: Session Snapshot Positions

Status: accepted
Date: 2026-09-24
Iteration: 0018
Owners: user, coordinator, foundations, sessions, and transport workstreams
Supersedes: none
Superseded by: none

## Context

The local and remote resolvers accept committed membership positions, while the core documentation used the ambiguous phrase "application position."
See the [foundations](../iterations/0018/phase-2/foundations.md) and [sessions](../iterations/0018/phase-2/sessions.md) reports.

## Decision Drivers

Preserve compatibility and one committed session order; make snapshot boundaries consistent across implementations.

## Options and Evidence

Allowing all committed session events preserves existing behavior.
Restricting positions to application payload events would require coordinated validation and compatibility changes.

## Decision

The user selected any committed session-event position, including `Application`, `Joined`, and `Left`.
Resolution and snapshot publication must not reject a valid boundary solely because it is a membership event.
Existing provenance, publication-authority, and committed-position checks still apply.

## Consequences

Clarify the owning core contract and misleading implementation wording.
No application-only restriction or new runtime capability is introduced.

## Validation and Follow-Up

Focused local and remote evidence must protect membership-position resolution/publication.
Revisit only with an explicit compatibility decision or a newly discovered inconsistency.
