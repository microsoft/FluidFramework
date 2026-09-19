# Decision 0015: Terminal Append Authority

Status: accepted
Date: 2026-09-19
Iteration: none; lightweight integration-test work
Owners: user and implementation owner
Supersedes: none
Superseded by: none

## Context

An append rejection previously left a session usable, allowing accepted events after a missing event.
Counting events through the ordered departure introduced by [decision 0014](0014-ordered-session-membership.md) therefore could not identify the client's accepted prefix.
Lost acknowledgments and cancelled asynchronous preparation create the same risk unless every admitting layer preserves fail-stop order.

## Decision Drivers

Application payloads may be non-idempotent and depend on their original reference and preceding local submissions.
SEA cannot transform them, infer application intent, or treat receipt loss as rejection.
Recovery must establish a final accepted prefix before a caller transforms the unaccepted suffix.

## Options and Evidence

Continuing the same session after failure permits holes and invalidates prefix counting.
Blind retries can duplicate effects or bind unchanged payloads to a different context.
Terminal append authority preserves the prefix while permitting independent archive replay and exact outcome lookup.
Focused sequencer, encryption, transport, and generated-binding regressions are recorded in the [active plan](../../INTEGRATION_TEST_CONFIGURATION_PLAN.md#ordered-append-contract-correction).

## Decision

Accepted application events form a prefix of admitted submissions.
The first append error or cancellation after admission revokes authority, including clones and queued submissions.
Local Rust callers establish their intended invocation order; transports preserve received order, and the neutral TypeScript wrapper serializes author calls before input conversion.
For announced sessions, close settles accepted work and persists a final leave; unresolved storage settlement blocks successful closure and requires recovery.
An independent session can replay through that leave.
Only the application transforms and resubmits the unaccepted suffix under a fresh session.
Exact operation lookup confirms an existing result and is not fresh resubmission.

## Consequences

Tests and callers must stop using an author session after deliberate rejection.
No background executor is assumed: subsequent state-dependent work, explicit close, or owner cleanup drives retained settlement and departure.
Cancelled preparation in a decorator is terminal even when its inner session has not received an append.
The durable minimum-reference floor remains an independent document-wide contract, not a membership heuristic.

## Validation and Follow-Up

Regression evidence covers rejection, ambiguity, pre/post-commit cancellation, malformed input, queued submissions, wrapper clones, transport lifecycle, fresh-session recovery, and ordered departure.
Workspace and canonical binding/browser gates remain required before the implementation checkpoint.
RS-024 tracks the durable reference floor; RS-025 tracks replacement of the Fluid driver's unsafe explicit retry helper with application-owned transformed resubmission.