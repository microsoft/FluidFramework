# Decision 0030: Defer Compound Client Errors

Status: accepted
Date: 2026-09-29
Iteration: 0020
Owners: User and iteration coordinator
Supersedes: none
Superseded by: none

## Context

The [transport audit](../iterations/0020/phase-2/transport.md) confirmed that a failed stream cancellation can replace an initiating request timeout.
Author and snapshot request handling then misses the timeout-to-ambiguity conversion.
This violates the existing [client timeout contract](../../crates/sea-webtransport/README.md#lifecycle-and-ownership) when a mutating request times out and cleanup also fails.
The failed cleanup cannot establish that the peer did not commit.

## Decision Drivers

- Preserve the initiating operation's recovery classification.
- Surface secondary cleanup failures rather than silently discarding them.
- Avoid an unapproved compatibility change to exhaustive matches on public Rust error enums.
- Continue the approved full incremental audit and unrelated localized repairs.

## Options and Evidence

1. Add `Cleanup { operation, cleanup }` variants to `ClientError` and `SeaClientError`, deriving classification from the initiating error.
   The proposed patch passed a focused red/green regression for submit, membership append, and snapshot publication, plus a nonmutating control and affected-crate validation.
   It adds no wire variant but requires consumers' exhaustive Rust matches to handle the new variants.
2. Design another representation that preserves classification and diagnostics without those variants.
   No alternative representation was accepted or validated in this iteration.
3. Defer the API addition and bug fix, retaining the confirmed finding and other audit repairs.

## Decision

The user explicitly selected option 3 before transport integration.
Do not accept the compound variants, associated implementation changes, new contract claim, or regression tests that require the deferred representation.
Retain the experiment's evidence in the workstream report and the unresolved issue in [Known Issues](../../KNOWN_ISSUES.md#client-timeout-classification-can-be-lost-when-cleanup-fails).
The review scope is unchanged; this is a repair deferral, not permission to omit inspection.

## Consequences

Public Rust error enums and wire behavior remain unchanged by this audit.
The confirmed recovery-classification defect remains.
No passing aggregate suite or successful cleanup path closes it.
The existing documented timeout promise is not weakened to match the defect.
Other transport contract/test repairs remain eligible for acceptance.

## Validation and Follow-Up

The transport report retains the exact failed assertion, proposed repair validation, and final validation after removing the proposal.
The coordinator preserved the original frozen proposal with SHA-256 `97c5cf4a2df86c9f768631d7c3d3b16844be57a5ed81a67f5e4b19e8e1f45c72` in session evidence.
Revisit when the user approves an error representation/API migration or a consumer requires correct classification under failed cleanup.
Any accepted future repair must distinguish mutating from nonmutating timeouts, preserve both diagnostics, and validate owning-client behavior rather than relying on a server to mask the error.
