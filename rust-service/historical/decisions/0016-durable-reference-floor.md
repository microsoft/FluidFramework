# Decision 0016: Durable Reference Floor

Status: accepted
Date: 2026-09-19
Iteration: none; lightweight integration-test work
Owners: user and implementation owner
Supersedes: none
Superseded by: none

## Context

The active-member minimum could decrease on admission, and absent references bypassed its check.
The temporary Fluid minimum of zero avoided regression but prevented efficient release of collaboration state.
The user required a durable monotonic document floor independent of its advancement heuristic.

## Decision Drivers

Admission must reject stale context without reinterpreting application payloads.
Advances must survive recovery and reach live and replay readers in archive order.
Idle readers must not permanently pin progressing writers, while advancement must not depend on uncommitted storage outcomes.

## Options and Evidence

A membership-only minimum is not durable or monotonic.
A client-side high-water clamp could promise a floor the server does not enforce.
Separate control records are possible but unnecessary while every event already carries ordered minimum-reference metadata and the service retains all history.
Persisting advances atomically in that metadata avoids an additional append and notification race.

## Decision

Maintain an independent committed floor, restored by archive replay and compared with every new submission reference.
Absent context is below every concrete floor; exact accepted-operation lookup is not new admission.
Use each application's or membership's envelope as the ordered floor-advance record.
Choose advances from cooperative member progress and a 1024-position lag window coalesced to 64-position boundaries, capped by the carrying event's reference.
Only commitment changes the enforced floor.
Snapshot event boundaries retain their floor envelopes; future compaction must retain equivalent snapshot metadata.
Map this floor into Fluid's dense sequence space rather than fixing its minimum at zero.

## Consequences

Old readers can catch up, but stale writers must terminate and transform their unaccepted suffix under a fresh session.
The policy may evolve without weakening admission enforcement.
The encoding markers advance to `SEAQ3` and `SEAM2`, and wire protocol to 7; earlier experimental archives need explicit migration and are not silently reinterpreted.

## Validation and Follow-Up

Sequencer regressions cover new membership, absent/stale references, exact lookup, recovery, failed/ambiguous writes, snapshot boundaries, and coalesced advancement despite idle readers.
The Fluid regression covers advancing dense minima across close/reopen and identical bounded replay.
Composition and canonical generated Node/Chromium tests cover existing consumers.
RS-025 remains separate: the driver must not replay an untransformed payload with a fresh reference.