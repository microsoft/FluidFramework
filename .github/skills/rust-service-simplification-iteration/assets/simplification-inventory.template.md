# Iteration {{ITERATION}} Rust Simplification Inventory

Status: in progress
Source commit: <!-- TODO(required): record the exact manifest sourceCommit used for before-and-after comparison -->
Review mode: <!-- TODO(required): record broad current-state review, targeted, incremental, or the approved combination -->
Configured scope: <!-- TODO(required): summarize or link the user-confirmed crate or responsibility scope and explicit exclusions -->
Coverage commitment: <!-- TODO(required): record full scope or a bounded sample, estimated effort, whether the proposed default covers the scope, and the approved discovery and assessment limits -->
Repair budget: <!-- TODO(required): record repair limits separately; reaching them must not stop promised full-scope discovery or assessment -->
Execution structure: <!-- TODO(required): record the user's explicit parallel-iteration authorization; sequential reviews use a local report with the same configuration and coverage accounting -->
Inherited quality inventory: <!-- TODO(required): link accepted quality evidence or write none and require each candidate to establish its contracts and tests -->
Inherited simplification inventory: <!-- TODO(required): link prior candidates and dispositions or write none -->
Permitted changes: <!-- TODO(required): record constraints on public APIs, dependencies, protocols, generated bindings, platforms, and performance -->
Stopping conditions and waves: <!-- TODO(required): summarize or link the charter's discovery/assessment completion criteria and repair waves, including later-wave cross-crate ownership -->

## Selection Rationale

<!-- TODO(required): describe the evidence used to order discovery and assessment and to select bounded repairs. For full scope, risk ranking orders work rather than omitting lower-ranked areas. For a bounded sample, state expected coverage and what will remain unreviewed. Do not treat size or textual similarity alone as a finding. -->

## Scope Coverage

Account for every scoped crate or responsibility area, including areas with no worthwhile candidates.
Full-scope review means examining each area and assessing its material candidates, not inspecting every declaration or implementing every opportunity.
Distinguish completed discovery and assessment from repair completion.
Use `reviewed`, `partially reviewed`, `unreviewed`, or `excluded` for coverage status, with evidence or a reason.
Exclusions need justification; budget exhaustion leaves incomplete coverage rather than an exclusion or a no-change result.

| Crate or responsibility area | Review owner | Coverage status | Examined responsibilities and evidence | Candidate IDs or no-change result | Unreviewed work, blocker, or exclusion rationale |
| --- | --- | --- | --- | --- | --- |
| <!-- TODO(required): replace with every scoped area, not only areas with candidates or repairs --> | | | | | |

## Reviewed Candidates

Use stable identifiers where practical.
Link each responsible workstream report.
For accepted changes, name the preserved responsibility, link its contract and discriminating tests, and describe the mechanism removed.
Account for moved code and do not report it as deletion.
Use the skill's dispositions: `simplified`, `consolidated`, `deleted`, `already proportionate`, `deferred`, `excluded`, or `rejected`.
If no worthwhile candidates were found, include an evidence-backed area-level `already proportionate` row and link its coverage evidence rather than inventing a candidate.

| Candidate | Owner and consumers | Complexity evidence | Preserved contract and safety evidence | Proposed reduction and cheapest disproof | Disposition | Actual reduction | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <!-- TODO(required): replace with reviewed candidates; do not use file size or textual similarity as the sole evidence --> | | | | | | | | |

## Deferred Candidates

<!-- TODO(required): separately list unreviewed areas or candidates, assessed-but-unrepaired candidates, and justified exclusions. Record remaining value, blocker or coverage/repair-budget reason, and a concrete revisit trigger; write none for each category when applicable. An unreviewed area is incomplete coverage, not a deferred repair. -->

## Cross-Workstream Consolidation

<!-- TODO(required): record candidates that cross ownership boundaries, their single assigned owner or disposition, integration order, and whether shared complexity was removed rather than displaced; write none when applicable. -->

## Contract and Validation Review

<!-- TODO(required): summarize behavior-preservation evidence, contract or test ownership changes, focused checks, canonical validation, performance checks where relevant, and any focused quality follow-up. For every removed test cited by the inherited quality inventory, link a surviving test that discriminates the same owning decision or record the approved contract change. -->

## Net Effect

<!-- TODO(required): summarize production additions and deletions and the more meaningful structural reductions or increases: implementations, dependencies, types, states, branches, conversions, public items, or generated output. Explain moved code, necessary test or documentation additions, and any complexity introduced. Do not use line count as a quality score. -->

## Convergence Assessment

<!-- TODO(required): compare inherited candidates, accepted reductions, rejected hypotheses, deferred opportunities, replacement abstractions, and stopping conditions. Reconcile actual discovery and assessment with the approved coverage, including no-change areas. State whether another run is justified and its specific hypothesis; convergence does not end promised coverage early. Set Status to complete only after final reconciliation and satisfaction of the approved coverage, including when explicit repair deferrals remain. Do not mark promised full coverage complete with unreviewed areas or material candidates unless the user explicitly reduces coverage; record that approval and remaining gaps without claiming full coverage. -->
