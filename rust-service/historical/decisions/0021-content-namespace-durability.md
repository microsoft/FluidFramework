# Decision 0021: Content Namespace Durability

Status: accepted
Date: 2026-09-24
Iteration: 0018
Owners: user, coordinator, foundations workstream
Supersedes: none
Superseded by: none

## Context

The standalone content-store constructor creates missing namespace directories but synchronized only the root.
That did not establish durability of parent entries retaining the root.
See the [foundations report](../iterations/0018/phase-2/foundations.md).

## Decision Drivers

Self-contained creation, explicit durability ownership, error propagation, and consistency with existing file-backend filesystem assumptions.

## Options and Evidence

Constructor-owned synchronization preserves a useful opens-or-creates contract.
Caller-provisioned durable ancestry would require a new precondition.
The file backend supplies bottom-up synchronization and filesystem-boundary precedent.

## Decision

The user selected constructor ownership.
Synchronize bottom-up through the namespace filesystem, stop at a filesystem boundary, and propagate synchronization failures.

## Consequences

Construction performs additional synchronization.
This does not qualify physical power-loss behavior or extend guarantees to external writers, unsupported filesystems, or devices that misreport synchronization.

## Validation and Follow-Up

The foundations workstream adds focused synchronization-order, filesystem-boundary, and failure-propagation tests and owning documentation.
Revisit on namespace ownership or filesystem support changes.
