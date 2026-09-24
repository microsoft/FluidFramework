# Decision 0025: Native Timeout Scope

Status: accepted
Date: 2026-09-24
Iteration: 0018
Owners: user, coordinator, transport workstream
Supersedes: none
Superseded by: none

## Context

The native client configuration promised framed-I/O deadlines but applied its timeout only during connection and initial session-stream opening.
Later native I/O does not retain that client-side deadline.
Server-side frame enforcement does not establish a client deadline against a stalled custom server.

## Decision Drivers

Accurate documentation and explicit cancellation/timeout ownership without an unapproved transport redesign.

## Options and Evidence

Adding native per-frame enforcement requires safe partial-frame cancellation and stream-terminal semantics.
Correcting the promise describes the existing implementation without changing behavior.
See the [transport audit](../iterations/0018/phase-2/transport.md).

## Decision

The user selected documentation correction now.
State opening-only native client timeout behavior and distinguish server-owned frame deadlines.
Defer native per-frame enforcement to a separate design task.

## Consequences

Native clients still lack their own post-opening per-frame deadline.
Do not claim server enforcement protects clients against every stalled or custom server.

## Validation and Follow-Up

Reconcile configuration, API, and guide wording.
Revisit when native per-frame deadlines are required, with focused stalled-peer and partial-frame cancellation evidence.
