# Iteration {{ITERATION}} Rust Simplification Inventory

Status: in progress
Source commit: <!-- TODO(required): record the exact manifest sourceCommit used for before-and-after comparison -->
Review mode: <!-- TODO(required): record broad current-state review, targeted, incremental, or the approved combination -->
Configured scope: <!-- TODO(required): summarize or link the user-confirmed crate or responsibility scope and explicit exclusions -->
Category profile: <!-- TODO(required): record the global level and resolved Off, Conservative, or Structural level for documentation, tests, implementation, abstractions, code organization, and naming; default proposal is Conservative everywhere, not implicit authorization -->
Coverage commitment: <!-- TODO(required): record full scope or a bounded sample, estimated effort, whether the proposed default covers the scope, and the approved discovery and assessment limits -->
Repair budget: <!-- TODO(required): record repair limits separately; reaching them must not stop promised full-scope discovery or assessment -->
Execution structure: <!-- TODO(required): record the user's explicit parallel-iteration authorization; sequential reviews use a local report with the same configuration and coverage accounting -->
Inherited quality inventory: <!-- TODO(required): link accepted quality evidence or write none and require each candidate to establish category-appropriate safety evidence, including contracts and discriminating tests before production edits -->
Inherited simplification inventory: <!-- TODO(required): link prior candidates and dispositions or write none -->
Permitted changes: <!-- TODO(required): record constraints on public APIs, dependencies, protocols, generated bindings, platforms, and performance -->
Stopping conditions and waves: <!-- TODO(required): summarize or link the charter's discovery/assessment completion criteria and repair waves, including later-wave cross-crate ownership -->
Checkpoint review: <!-- TODO(required): record or link planned cohesive checkpoints, review depth, and bounded repair/review allowance under the checkpoint-review skill; review does not authorize commits -->

## Selection Rationale

<!-- TODO(required): describe the evidence used to order discovery and assessment and to select bounded repairs. For full scope, risk ranking orders work rather than omitting lower-ranked areas. For a bounded sample, state expected coverage and what will remain unreviewed. Do not treat size or textual similarity alone as a finding. -->

## Scope Coverage

Account for every scoped crate or responsibility area, including areas with no worthwhile candidates.
Full-scope review means examining each area and assessing its material candidates, not inspecting every declaration or implementing every opportunity.
Assess enabled categories under the resolved profile; Conservative ambition does not reduce promised area coverage.
Record disabled categories as configured exclusions, not as reviewed no-change results.
Distinguish completed discovery and assessment from repair completion.
Use `reviewed`, `partially reviewed`, `unreviewed`, or `excluded` for coverage status, with evidence or a reason.
Exclusions need justification; budget exhaustion leaves incomplete coverage rather than an exclusion or a no-change result.

| Crate or responsibility area | Review owner | Coverage status | Examined responsibilities and evidence | Candidate IDs or no-change result | Unreviewed work, blocker, or exclusion rationale |
| --- | --- | --- | --- | --- | --- |
| <!-- TODO(required): replace with every scoped area, not only areas with candidates or repairs --> | | | | | |

## Reviewed Candidates

Use stable identifiers where practical.
Link each responsible workstream report.
For accepted changes, name the preserved responsibility or meaning, link category-appropriate safety evidence, and describe the maintenance benefit.
Classify by primary intent, not file type.
In the linked evidence, record the profile level, necessary supporting edits and their rationale, and checkpoint base, reviewed state, findings, dispositions, validation, and accepted commit when authorized.
Use preserved meaning and link checks as safety evidence for documentation-only changes; do not invent test requirements unrelated to the edit.
Account for moved code and do not report it as deletion.
For duplication decisions, identify required semantic agreement and its authoritative owner or consistency checks, or explain why coincidental similarity is better left separate.
Preserve independent regression expectations where sharing with production would hide defects.
Use the skill's dispositions: `simplified`, `consolidated`, `deleted`, `already proportionate`, `deferred`, `excluded`, or `rejected`.
If no worthwhile candidates were found, include an evidence-backed area-level `already proportionate` row and link its coverage evidence rather than inventing a candidate.

| Candidate | Primary category | Owner and consumers | Complexity evidence | Preserved contract and safety evidence | Proposed improvement and cheapest disproof | Disposition | Actual improvement | Validation and checkpoint review | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <!-- TODO(required): replace with reviewed candidates; do not use file size or textual similarity as the sole evidence --> | | | | | | | | | |

## Deferred Candidates

<!-- TODO(required): separately list unreviewed areas or candidates, assessed-but-unrepaired candidates, and justified exclusions. Record remaining value, blocker or coverage/repair-budget reason, and a concrete revisit trigger; write none for each category when applicable. An unreviewed area is incomplete coverage, not a deferred repair. -->

## Cross-Workstream Consolidation

<!-- TODO(required): record candidates that cross ownership boundaries, their single assigned owner or disposition, integration order, and whether shared complexity was removed rather than displaced; write none when applicable. -->

## Contract and Validation Review

<!-- TODO(required): summarize behavior-preservation evidence, contract or test ownership changes, focused checks, canonical validation, performance checks where relevant, and any focused quality follow-up. For every removed test cited by the inherited quality inventory, link a surviving test that discriminates the same owning decision or record the approved contract change. -->
<!-- TODO(required): reconcile checkpoint challenge reviews and category-profile compliance, including necessary mixed-category edits, characterization tests checked before implementation changes, and any rejected or deferred repairs. Complete accepted repairs only with finished review coverage, no unresolved blocking findings, and required validation under the checkpoint-review skill. -->
<!-- TODO(required): link evidence for the skill's clarity safeguards and review prompts for the primary and supporting categories. For moves, account for original and destination content, including complete doc and implementation comments, their attachment to code, and every omission or non-mechanical adaptation. Passing tests or rename detection alone is not lossless-move evidence. Record material clarity regressions as blocking findings, separately from optional stylistic suggestions. -->
<!-- TODO(required): for test restructuring, link old-to-new case and assertion mappings, execution checks, and proportionate failure-detection evidence. Link preserved checkpoints or the ordered patch series through integration, and any repeated validation and review needed when later repairs changed earlier assumptions; write not applicable where appropriate. -->

## Net Effect

<!-- TODO(required): summarize maintenance benefits across the enabled categories, including clearer documentation, preserved test cases and diagnosis, improved naming or organization, and structural reductions or increases. Account for production additions and deletions, moved code, necessary test or documentation additions, and any complexity introduced. Do not use line count as a quality score. -->

## Convergence Assessment

<!-- TODO(required): compare inherited candidates, accepted reductions, rejected hypotheses, deferred opportunities, replacement abstractions, and stopping conditions. Reconcile actual discovery and assessment with the approved coverage, including no-change areas. State whether another run is justified and its specific hypothesis; convergence does not end promised coverage early. Set Status to complete only after final reconciliation and satisfaction of the approved coverage, including when explicit repair deferrals remain. Do not mark promised full coverage complete with unreviewed areas or material candidates unless the user explicitly reduces coverage; record that approval and remaining gaps without claiming full coverage. -->
