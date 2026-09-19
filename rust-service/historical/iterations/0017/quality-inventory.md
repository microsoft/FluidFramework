# Iteration 0017 Rust Quality Inventory

Status: in progress
Source commit: `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`
Review mode: User-approved incremental audit.
Configured scope: Neutral signals relay, transport lifecycle, and file/sequencer recovery as bounded by the [charter](charter.md).
Reassessment trigger: Recent relay and timeout changes, remaining lifecycle evidence questions, and replacement recovery implementations reflected in historical reconciliation.
Inherited inventory: [Iteration 0016](../0016/quality-inventory.md) and [deferral reconciliation](../../DEFERRAL_RECONCILIATION.md), treated as hypotheses to check against current contracts.
Budget and stopping conditions: Initially two risk-ranked boundaries per workstream and at most one repair cluster each; stop or defer beyond that budget and request coordinator approval for expansion or shared choices.

## Selection Rationale

Signals prioritizes the recently added neutral relay because new cross-consumer behavior has less accumulated evidence.
Transport prioritizes lifecycle responsibilities because the recent timeout change and reported browser gap cross implementation and platform boundaries.
Recovery prioritizes current file/sequencer contracts because historical acceptance may refer to replaced implementation or settlement behavior.
These are candidate areas, not findings or a preselected test list.
Each delegate ranks and records its two exact boundaries from current evidence before repair, explaining why they outrank remaining candidates.
Unchanged unrelated crates and broad historical re-audits rank below these incremental risks within the approved budget.

## Reviewed Boundaries

Use stable identifiers where practical. Test layers are `focused`,
`conformance`, `integration`, `generated`, and `platform`.

Link the responsible workstream report in each row so the final review can account for every active workstream.
Quote or link the precise relied-upon contract and name the owning decision that the discriminating test protects.
For `already adequate`, identify the nearest test that would fail if only that decision regressed, or explain why focused evidence is not practical.
For accepted repairs, link the changed contract, tests, and validation evidence.
Use the skill's dispositions: `repaired`, `already adequate`, `consumer corrected`, `deferred`, `excluded`, or `rejected`.
Give unresolved findings a concrete revisit trigger and identify an owner when known.

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kickoff only: no boundary reviewed | Signals, transport, recovery delegates | Selected areas above | To be identified from current contracts | Not assessed | Two boundaries per delegate | Not yet reviewed | None | Start artifact check only | Replace with evidenced rows at integration |

No boundaries have been reviewed for iteration 0017 at kickoff.
The kickoff row satisfies the structural validator's nonempty-table requirement, not an adequacy claim; remove it at integration.
The coordinator will reconcile evidenced rows from the [signals](phase-2/signals.md), [transport](phase-2/transport.md), and [recovery](phase-2/recovery.md) reports after workstreams return.

## Deferred Candidates

Eligible but unselected boundaries within each owned scope remain unreviewed, not adequate or rejected.
Their workstream owner must name material candidates, remaining risk, and a concrete revisit trigger after ranking; expansion requires coordinator approval.
Shared semantic/API questions remain coordinator decisions, not delegate repair opportunities.
Historical unresolved items are candidate inputs only; this initialization neither closes nor reaffirms them.

Explicit exclusions are broad rewrites, retention, authentication, production/power-loss qualification, CI-feed work, and Fluid integration ongoing elsewhere.
They require a separate approved scope; findings here do not authorize changes there.
No next iteration or push is authorized.

## Coverage Layer Review

Not assessed at kickoff.
Reconciliation must distinguish owning-decision evidence from topical coverage and identify any justified cross-boundary evidence, overlap, or remaining broad-only gap.
Prior test passes do not establish current local diagnosis.

## Convergence Assessment

Not assessed at kickoff; there are no observed findings, repairs, or adequacy dispositions yet.
After integration and independent review, compare actual reviewed boundaries and unresolved risk with inherited hypotheses and the bounded budget.
Accept a supported no-change result and do not manufacture documentation or tests.
Set status to complete only after final reconciliation, including explicit deferrals and their triggers.
Any later work recommendation is not authorization to initialize another iteration.
