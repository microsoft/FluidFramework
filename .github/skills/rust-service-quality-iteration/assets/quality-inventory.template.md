# Iteration {{ITERATION}} Rust Quality Inventory

Status: in progress
Source commit: <!-- TODO(required): record the approved iteration source commit -->
Review mode: <!-- TODO(required): record incremental, full reassessment, targeted, or the approved combination -->
Configured scope: <!-- TODO(required): summarize or link the user-confirmed charter scope, including explicit exclusions -->
Reassessment trigger: <!-- TODO(required): record why previously accepted boundaries are being revisited, such as a user request or skill/model improvements; write none when not applicable -->
Inherited inventory: <!-- TODO(required): link prior inventory inputs or write none -->
Coverage commitment: <!-- TODO(required): record full-scope review or a bounded sample; for full scope, link the map accounting for every selected crate or responsibility area -->
Budget and stopping conditions: <!-- TODO(required): record estimated review effort and any approved limits separately from repair limits, or link the charter; a repair limit does not end full-scope review -->

## Selection Rationale

<!-- TODO(required): identify the risk evidence used to order review within the confirmed mode, scope, and budget. For bounded review, explain why selected boundaries outrank deferred candidates. For full-scope review, account for every selected crate or responsibility area instead of selecting only a high-risk subset. Do not name private expected findings. Prior acceptance does not exclude a boundary from an approved reassessment. -->

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
| <!-- TODO(required): replace with reviewed boundaries; do not use a placeholder or declaration-per-row inventory --> | | | | | | | | | |

## Deferred Candidates

<!-- TODO(required): distinguish explicit scope exclusions from eligible candidates left unreviewed because of budget or stopping conditions. List material candidates, why they were not selected, remaining risk, and a concrete revisit trigger; write none after review when applicable. -->

## Coverage Layer Review

<!-- TODO(required): summarize whether focused, conformance, integration, generated-binding, and platform tests prove distinct responsibilities; identify accepted overlap, consolidation, or remaining broad-only evidence -->

## Convergence Assessment

<!-- TODO(required): compare inherited findings, changed or reassessed boundaries, new material findings, repaired risk, redundant churn, and the configured stopping conditions. Reconcile actual coverage with the approved full-scope or bounded commitment; full reassessment alone does not establish exhaustive coverage. State whether another run is justified and the hypothesis it would test. After final review, set Status to complete even when explicit repair deferrals remain, but not when promised review coverage remains incomplete without user-approved scope reduction. -->
