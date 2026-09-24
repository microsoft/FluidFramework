# Decision 0024: Disconnect Error State

Status: accepted
Date: 2026-09-24
Iteration: 0018
Owners: user, coordinator, transport workstream
Supersedes: none
Superseded by: none

## Context

The generic client abandons logical state even when physical transport disconnect fails, without an explicit error-state promise.
Existing state-only tests did not exercise the outer fallible transport call.

## Decision Drivers

Preserve current behavior, avoid uncertain authority reuse, propagate physical errors, and make explicit recovery requirements testable.

## Options and Evidence

Abandoning logical state prevents continued use after uncertain physical closure.
Keeping state available would introduce different retry and authority semantics.
The [transport report](../iterations/0018/phase-2/transport.md) records the owning implementation.

## Decision

The user selected abandonment even on physical disconnect failure.
Propagate the physical error, abandon authority and pending correlations, reject subsequent requests on that disconnected client, and require explicit recovery.

## Consequences

A disconnect error does not restore logical admission or imply physical closure.
No automatic retry or reconnect is added.

## Validation and Follow-Up

Document the outer client contract and test transport error propagation, logical admission, pending-state cleanup, and explicit recovery.
Revisit if recovery ownership changes.
