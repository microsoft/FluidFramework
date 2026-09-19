# Decision 0002: Receipts and Snapshots

Status: accepted
Date: 2026-09-12
Iteration: foundation
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

Clients need to distinguish visibility from durability and must not accidentally replace a newer snapshot with an older recovery point.

## Decision Drivers

The memory, minimal-file, and durable-log implementations intentionally provide different guarantees. Snapshot publication needs both lineage and non-regression, while the opaque kernel cannot verify application state correctness.

## Options and Evidence

A receipt position alone hides durability. Parent comparison alone permits a correctly parented snapshot to regress. Comparing opaque positions in the shared trait is impossible without leaking implementation ordering. The reference implementation can validate its own positions and the conformance suite demonstrates parent conflicts and regression rejection.

## Decision

Successful appends return a position and explicit `Memory`, `Buffered`, or `Durable` classification. Implementation errors expose stable categories including ambiguous outcomes. Snapshot stores return the latest snapshot with its ID, require an expected parent, validate position ownership, and reject position regression when they can order their own positions. Snapshot payload correctness remains a client claim.

## Consequences

Clients cannot mistake in-process visibility for crash durability or silently retry ambiguity. Monotonic checks remain implementation-owned instead of adding public position arithmetic. Future external snapshot stores may need a stronger monotonic publication token or cooperation with the append store.

## Validation and Follow-Up

Shared conformance covers parent conflict and regression. The durable-log and Fluid spikes must report whether the durability vocabulary and store-local monotonic check are sufficient.
