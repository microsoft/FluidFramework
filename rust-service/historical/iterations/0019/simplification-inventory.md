# Iteration 0019 Rust Simplification Inventory

Status: in progress
Source commit: `575b77e825e598b15b7740f56956fe433a6153d8`
Skill revision: Source commit `575b77e825e598b15b7740f56956fe433a6153d8`; the simplification and coordination skill directories have no local changes.
Review mode: Broad current-state review, including unchanged code.
Configured scope: All 15 Rust workspace members. Generated artifacts and non-Rust packages are excluded from proactive cleanup; strictly necessary supporting edits and distinct-boundary validation remain permitted. See the [charter](charter.md).
Category profile: Conservative globally and individually for documentation, tests, implementation, abstractions, code organization, and naming. No category is Off or Structural.
Coverage commitment: Full-scope discovery and assessment with no candidate-count or time cutoff. The bounded default could cover only six risk-ranked areas and was rejected. Estimated planning effort is 25-40 material candidate assessments plus several hours of repair, review, and validation; the estimate does not limit coverage.
Repair budget: At most four independently reviewable repairs. Further assessed opportunities are recorded as deferred repairs and do not truncate coverage.
Execution structure: User-authorized parallel Rust-service iteration with five ownership-aligned crate workstreams and a pre-registered later-wave cross-crate owner.
Inherited quality inventory: [Iteration 0018](../0018/quality-inventory.md), including its accepted contracts and discriminating tests.
Inherited simplification inventory: None.
Permitted changes: Preserve public APIs, dependencies, protocols, generated bindings, supported platforms, and performance characteristics. Any change to those constraints requires separate user approval.
Stopping conditions and waves: Wave 1 completes all-area discovery and assessment without production edits. Wave 2 selects at most four repairs and assigns cross-crate work only to its registered owner. Wave 3 integrates and validates. See the [charter](charter.md#active-workstreams).
Checkpoint review: One coherent checkpoint per repair, fresh standard-depth fixed-base read-only review before any authorized commit, focused contract-preservation review for affected boundaries, and at most two bounded repair/review cycles. Review does not itself authorize a commit.

## Selection Rationale

The complete 0018 contract and regression inventory supplies current ownership
and safety evidence. Persistence/recovery, asynchronous lifecycle and state,
transport/resource ownership, core publication/progress, and generated consumer
boundaries order discovery because simplification errors there have the highest
behavioral and platform risk. Documentation, naming, tests, and organization
remain enabled and required in every area.
Candidate selection will compare confirmed mechanism reduction, ownership
clarity, maintenance cost, defect risk, validation strength, displaced
complexity, and cross-workstream conflicts. File size, line reduction, and
textual similarity alone cannot establish a candidate.

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
| `sea-core` | foundations | unreviewed | Core contracts, adapters, storage composition, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-memory` | foundations | unreviewed | Memory storage ownership, archives, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-content-addressed` | foundations | unreviewed | Content trees, publication, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-conformance` | foundations | unreviewed | Shared storage laws, fixtures, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-file` | persistence | unreviewed | Buffered/durable persistence, recovery, workers, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-sequencer` | sessions | unreviewed | Ordering, membership, election, recovery, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-signals` | sessions | unreviewed | Relay membership, routing, overflow, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-compression` | sessions | unreviewed | Transform wrapper, composition, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-encryption` | sessions | unreviewed | Transform wrapper, key handling, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-webtransport` | transport | unreviewed | Protocol/framing, stream lifetimes, native/browser paths, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-webtransport-server` | transport | unreviewed | Admission, runtime/cache ownership, transports, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-wasm` | consumers | unreviewed | Binding conversion/lifetime implementation, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-integration-tests` | consumers | unreviewed | Cross-crate composition fixtures and evidence | Pending Wave 1 | Full enabled-category assessment required |
| `sea-benchmarks` | consumers | unreviewed | Benchmark correctness infrastructure, fixtures, and guide | Pending Wave 1 | Full enabled-category assessment required |
| `sea-counter` example | consumers | unreviewed | Example composition, replay, tests, and guide | Pending Wave 1 | Full enabled-category assessment required |

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
| pending-wave-1 | Documentation | All scoped owners and consumers | Discovery not started | Inherited 0018 inventory; candidate-specific evidence pending | Complete full-scope assessment before repair selection | deferred | None yet | None yet | Wave 1 completion |

## Deferred Candidates

Unreviewed areas: all 15 members listed in Scope Coverage pending Wave 1.

Assessed-but-unrepaired candidates: none yet.

Justified exclusions: generated artifacts and non-Rust packages are excluded
from proactive cleanup. Revisit only when a selected Rust repair strictly
requires supporting edits or distinct-boundary validation.

## Cross-Workstream Consolidation

No candidate has yet been reported. The `cross-crate` workstream is the single
registered later-wave owner. It may edit only coordinator-assigned paths after
the five crate owners complete discovery and the candidate is selected.

## Contract and Validation Review

No repairs have begun. Candidate assessment must link the 0018 contract and
nearest discriminating evidence before selection.
Every accepted repair will record focused checks, applicable canonical gates,
the checkpoint's fixed base and reviewed state, category-profile compliance,
clarity assessment, contract-preservation findings, and any evidence repeated
after later changes.
Removed inherited tests require independent surviving evidence for the same
owning decision. Test restructuring requires old-to-new case/assertion mapping
and execution evidence. Moves require declaration, comment, attribute,
visibility, dependency, and link accounting beyond rename detection.

## Net Effect

<!-- TODO(required): summarize maintenance benefits across the enabled categories, including clearer documentation, preserved test cases and diagnosis, improved naming or organization, and structural reductions or increases. Account for production additions and deletions, moved code, necessary test or documentation additions, and any complexity introduced. Do not use line count as a quality score. -->

## Convergence Assessment

<!-- TODO(required): compare inherited candidates, accepted reductions, rejected hypotheses, deferred opportunities, replacement abstractions, and stopping conditions. Reconcile actual discovery and assessment with the approved coverage, including no-change areas. State whether another run is justified and its specific hypothesis; convergence does not end promised coverage early. Set Status to complete only after final reconciliation and satisfaction of the approved coverage, including when explicit repair deferrals remain. Do not mark promised full coverage complete with unreviewed areas or material candidates unless the user explicitly reduces coverage; record that approval and remaining gaps without claiming full coverage. -->

## Run Assessment

Give the user a concise, evidence-linked assessment; distinguish task completion from demonstrated benefit.
Reuse the records above rather than duplicating candidate details.
During a run, mark conclusions provisional and remaining coverage explicit.

- Coverage: <!-- TODO(required): compare promised and actual assessment, including unreviewed and no-change areas -->
- Value: <!-- TODO(required): summarize concrete benefits and tradeoffs by enabled category with representative evidence -->
- Safety: <!-- TODO(required): summarize completed validation/review, substantive problems caught, evidence gaps, and known regressions after acceptance; do not equate no reported regressions with proof of safety -->
- Effort: <!-- TODO(required): identify substantial discovery, implementation, validation, review, rework, or coordination costs; use observed data and explicit unknowns -->
- Recommendation: <!-- TODO(required): give a reasoned stop, specific follow-up, or profile/process adjustment recommendation consistent with the convergence assessment -->

<!-- TODO(required): assess candidate selection, confidence calibration, guardrails, decomposition, overhead, and user interventions using candidate/checkpoint evidence. Link deeper findings to the existing retrospective and skill-review records. For proposed improvements, link the observed problem, evidence, suspected cause, adjustment, next-run check, and accepted/rejected/deferred decision with revisit trigger; write none when justified. Distinguish unclear guidance from noncompliance, domain gaps, and tool limitations. -->

Use the recorded source, skill revision, profile, coverage, and execution structure to interpret comparisons.
Record relevant model/tool provenance only when available; no mandatory telemetry or composite score.
Keep later observations in subsequent linked reports rather than rewriting completed history.
