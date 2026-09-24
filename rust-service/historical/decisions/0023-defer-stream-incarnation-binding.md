# Decision 0023: Defer Stream Incarnation Binding

Status: superseded
Date: 2026-09-24
Iteration: 0018
Owners: user, coordinator, transport workstream
Supersedes: none
Superseded by: [0026: Bind Streams to Session Incarnations](0026-bind-stream-session-incarnations.md)

## Context

The [transport audit](../iterations/0018/phase-2/transport.md) reproduced an old author stream submitting under replacement session authority on the same physical connection.
Logical handlers retain a mutable connection service rather than their admitted session incarnation.

## Decision Drivers

Correct authority ownership, preserved reproduction, and explicit approval before dispatcher/cleanup redesign.

## Options and Evidence

Binding each stream to its admitted session preserves reopening but changes dispatch ownership.
Rejecting replacement until a new physical connection changes existing reopen behavior.
The retained real-QUIC reproducer demonstrates the current defect.

## Decision

The user deferred the repair for this iteration.
Retain the explicitly ignored failing reproducer and document the limitation.
This is a repair deferral, not acceptance of cross-incarnation authority or incomplete review coverage.

## Consequences

The defect remains.
Do not rely on stale logical streams being isolated from a replacement session.
No binding redesign or replacement restriction is authorized by this record.

## Validation and Follow-Up

Retain the exact reproduction command in the transport report and current known issues.
Revisit before supporting safe same-connection session replacement or when dispatcher lifetime ownership changes.
