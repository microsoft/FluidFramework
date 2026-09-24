---
name: rust-service-simplification-iteration
description: 'Design and run a Rust-service simplification iteration across documentation, tests, implementations, abstractions, code organization, and naming while preserving documented behavior and proportionate regression evidence. Use when configuring, executing, reviewing, or repeating simplification, consolidation, deduplication, code-size reduction, or broad cleanup across rust-service crates.'
argument-hint: 'configure or run a Rust-service simplification and consolidation audit'
---

# Rust Service Simplification Iteration

Use this workflow to make Rust-service code, tests, and documentation easier to understand and maintain without weakening behavior, diagnostics, performance, or supported platforms.
Read `rust-service/DEVELOPMENT.md` for the quality bar and validation requirements.

This workflow does not require a historical size or growth baseline.
Pin an approved source commit so each accepted repair has a reproducible before-and-after comparison.
Treat size measurements as evidence, not as targets.

Configure scope, coverage budget, and execution structure as separate choices, in that order.
Explicitly ask whether to use a parallel iteration unless the user has already chosen an execution structure.
Selecting the parallel-iteration option is explicit authorization to load `.github/skills/rust-service-coordination/SKILL.md` for iteration mechanics.
Do not load it merely to ask the configuration question.
The numbered-record, workstream, integration, and Phase 3 instructions below apply only in that case.
Otherwise retain the configuration, candidates, dispositions, and evidence in an existing local report.
If no suitable report exists, create one local report in the repository documentation location for the affected area and reuse it throughout the work.

## Relationship to Quality Iterations

Prefer this order when both workflows are planned:

1. complete and integrate the contract and regression-test quality iteration;
2. use that accepted commit and quality inventory as inputs to the simplification iteration; and
3. perform focused contract-preservation review of changed and directly affected boundaries.

Do not run broad quality and simplification iterations concurrently against moving versions of the same code.
The quality iteration identifies behavior that consumers rely on.
The simplification iteration uses those contracts and tests as safety evidence.

A prior quality inventory is useful but not mandatory.
Without one, each simplification candidate must establish the relevant contract and the nearest discriminating test before production edits begin.
If responsibility or required behavior cannot be determined, defer the candidate to a quality audit instead of guessing.

## Principles

- Simplify the current code, tests, and documentation; do not infer a defect from historical growth.
- Preserve required behavior, useful diagnostics, performance characteristics, and platform support.
- Prefer deletion and reuse over moving complexity or introducing a more general abstraction.
- Count a consolidation only when it leaves one clear owner and removes competing implementations.
- Require evidence of accidental complexity before editing.
- Treat generated code, explicit error handling, platform-specific implementations, and distinct test layers as intentional until evidence shows otherwise.
- Do not optimize source-line count at the cost of readability, type safety, failure isolation, or local diagnosis.
- Do not add speculative extension points while removing existing complexity.
- Preserve rejected candidates and no-change results so later runs do not repeat low-value work without a revisit trigger.

## Cleanup Categories

Classify each candidate by its primary intent, not by the file types it touches.
A necessary test-import update during a move remains a code-organization change.
Use one primary category per reviewable change, not six separate workstreams or mandatory codebase-wide passes.

| Category | Intended improvements | Required safeguards |
| --- | --- | --- |
| Documentation | Tighten wording, use consistent terms, and link authoritative explanations instead of duplicating them. | Preserve contracts, qualifications, useful examples, and local context; fewer words alone are not an improvement. |
| Tests | Simplify fixtures, factor repetition, and use table-driven cases when clearer. | Preserve behavioral cases, discriminating assertions, test independence, and failure diagnosis; a coverage percentage alone does not establish equivalence. |
| Implementation | Simplify control flow, deduplicate logic or policy, and remove unnecessary state or dead paths. | Preserve behavior and validate against existing tests without weakening expectations. |
| Abstractions | Remove unnecessary layers, clarify ownership, and consolidate genuinely shared responsibilities. | Test one structural hypothesis at a time; similar syntax does not prove shared semantics or ownership. |
| Code organization | Move code to better owners, reduce coupling, simplify imports and exports, and remove unnecessary files. | Separate mechanical relocation from substantive edits where practical; check visibility, initialization, and dependency effects. |
| Naming | Use clearer, consistent names that describe responsibility and meaning. | Separate renaming from logic changes; check public APIs, serialization, reflection, and generated consumers. |

## Configure One Run

### Confirm the Scope

Before discovery or record initialization, propose a scope, explain why it is useful, and ask the user to confirm or customize it.
Offer these modes, which can be combined, without bundling coverage or repair limits into the choices:

- **Broad current-state review:** Make all selected crates eligible without requiring change history.
- **Targeted:** Review selected crates, abstractions, dependencies, or forms of complexity.
- **Incremental:** Revisit unresolved candidates, changed implementations, and recorded triggers from an earlier simplification inventory.

Make the crate or responsibility scope and exclusions explicit, including an all-Rust-service-crates option when no narrower area was requested.
An all-crate review includes unchanged code; it is not limited to the current diff.
If the user already supplied an explicit scope, restate it briefly without redundant confirmation, then resolve the remaining choices.
Scope selection alone does not authorize parallel execution or iteration setup.

### Choose the Category Profile

As part of scope configuration, before estimating coverage effort, propose **Conservative** across all six categories.
Ask the user to accept that profile or supply a global level with per-category overrides, unless already specified.
Do not ask six separate questions when one profile resolves the choices.

- **Off:** Do not proactively discover or repair cleanup candidates in this category.
- **Conservative:** Accept clear, low-disruption improvements with straightforward evidence.
- **Structural:** Also investigate larger, justified restructuring, with stronger validation and independent review evidence before acceptance.

For example, "Conservative everywhere" enables all categories.
"Structural implementation; Conservative documentation; all others Off" limits proactive cleanup to those two categories.
Record the resolved profile, including disabled categories, rather than leaving overrides implicit.
Structural ambition permits more investigation and disruption, not lower confidence, weaker behavior preservation, or unapproved API changes.
Every accepted repair still needs high-confidence evidence of benefit and safety.

An Off category permits only strictly necessary supporting edits for an enabled repair, with the reason recorded.
If those edits become substantial or independently useful cleanup, ask before expanding the category profile.
The profile does not replace the coverage commitment: a Conservative full-scope run still examines every scoped area for enabled categories, even when few repairs qualify.

### Choose Coverage And Budget

After scope and category-profile selection, estimate the effort needed using crate listings, prior inventories, and a lightweight responsibility map.
This estimate is configuration work, not completed discovery or assessment.
Explain whether the proposed default budget covers the whole selected scope or only a risk-ranked sample.
Never silently interpret an all-crate review as a small sample merely because all crates were eligible.

If the default budget cannot cover everything in scope, ask the user to choose:

- **Review everything in scope:** Examine every scoped crate or responsibility area and assess its material simplification candidates, without a fixed candidate-count or time cutoff.
- **Use the bounded default:** State the proposed effort limit and expected discovery and assessment coverage, explicitly noting what will remain unreviewed.
- **Choose a custom budget:** Let the user set effort or coverage limits before work starts.

If the default is sufficient, state the estimate and confirm it unless the user already authorized it.
Use separate questions for scope, coverage budget, and execution structure; skip choices that the user has already explicitly answered.
Record repair limits separately from discovery and assessment coverage.
Exhausting the repair budget must not stop authorized full-scope discovery or assessment: continue examining scoped areas and record additional assessed opportunities as deferred repairs.

Full-scope review does not mean implementing every opportunity, inspecting every declaration, finding every defect, or searching indefinitely for smaller code.
Use risk ranking to order that work, not to omit lower-ranked areas.
Stop discovery and assessment when the approved coverage is complete, or disclose a blocker and ask before reducing coverage or imposing a new cutoff.
For bounded review, stop at the approved limit and distinguish unreviewed areas and candidates from assessed-but-unrepaired candidates.
Ask before expanding scope or a bounded budget.

### Choose Sequential Or Parallel Execution

After scope and coverage budget are agreed, explicitly ask: "Should this simplification review use the parallel Rust-service iteration structure?"
Offer:

- **Parallel iteration:** Numbered records, isolated workstreams, a shared simplification inventory, integration, and Phase 3 review under the coordination skill.
- **Sequential review:** One local report, with the same approved scope and coverage budget.

Recommend parallel execution when the selected scope has substantial independent work, but let the user choose.
Do not infer sequential execution from a small diff or from the absence of the words "parallel iteration" in the initial request.
If the user already explicitly selected either structure, or is continuing an authorized run, preserve that choice without asking again.
Only after a parallel selection, load the coordination skill and follow its setup requirements.

Confirm whether discovery and repair use separate waves.
For a broad parallel iteration, prefer broad discovery and assessment followed by bounded repair work.
At kickoff, register ownership-aligned workstreams that can perform both discovery and accepted crate-local repairs.
If the scope permits cross-crate repairs, register a later-wave shared owner at kickoff; otherwise defer those repairs to an approved follow-on iteration.

### Record the Configuration

Record:

- approved source commit;
- selected mode, crate or responsibility scope, and exclusions;
- global category level and resolved per-category overrides;
- inherited quality and simplification inventories, if any;
- risk priorities;
- discovery and assessment coverage commitment (full scope or bounded sample), estimated effort, and any approved limits;
- repair budget, separate from discovery and assessment coverage;
- sequential review or explicitly authorized parallel iteration;
- stopping conditions and discovery/repair waves;
- permitted public API, dependency, protocol, generated-binding, and performance changes;
- required validation beyond the canonical gates; and
- checkpoint boundaries, independent review depth, and repair/review allowance.

For sequential work, put these inputs in the local report.
For an explicitly authorized parallel iteration, put them in the charter, workstream instructions, and simplification inventory.

## Discover Candidates

Use repository evidence and code intelligence to find candidates in the enabled categories:

- duplicated explanations, verbose wording, inconsistent terminology, and missing links to authoritative documentation;
- repetitive tests and fixtures that can be made clearer without losing cases or diagnostic precision;
- misplaced code, avoidable import/export layers, unnecessary files, and names that obscure responsibilities;
- duplicated algorithms, validation, parsing, conversion, error mapping, and test infrastructure;
- multiple implementations of one responsibility that do not represent distinct contracts or platforms;
- wrappers, adapters, intermediate representations, clones, allocations, and conversions without a required boundary;
- unnecessary state, caches, flags, synchronization, branches, and lifecycle phases;
- dead or obsolete compatibility paths, feature branches, APIs, and dependencies;
- abstractions that are more general than their actual consumers require;
- modules or traits with unclear ownership and avoidable delegation chains; and
- broad tests or fixtures that duplicate the same evidence without improving diagnosis.

Search and static-analysis results are candidate generators, not findings.
Textual similarity alone does not prove shared semantics.
Large files, functions, or crates are not automatically too complex.

Rank candidates by expected reduction, confidence, maintenance cost, defect risk, ownership clarity, validation strength, and cross-workstream conflict.
Record why selected candidates outrank deferred candidates.
For full-scope review, map every scoped crate or responsibility area to its review owner, examine each area, and assess material candidates in priority order.
Record evidence for areas with no worthwhile candidates; do not invent candidates or omit those areas.

## Assess a Candidate

For each candidate selected under the approved assessment coverage, including material candidates beyond the repair budget:

1. Identify the primary category, configured level, responsibility, owning component, consumers, and supported platforms.
2. Link the precise contracts consumers rely on.
3. Identify proportionate safety evidence: preserved meaning and valid links for documentation-only edits, preserved cases and assertions for test cleanup, and discriminating tests for affected behavior.
4. State a falsifiable simplification hypothesis, such as removing duplicated explanations, test setup, state representations, dependencies, implementations, conversions, or delegation layers.
5. Map affected callers, implementations, and documentation references before editing.
6. Use the cheapest check that can reject false duplication or reveal a distinct responsibility.
7. Estimate the maintenance benefit, name any displaced complexity, and identify necessary supporting edits outside the primary category.
8. Defer the candidate if semantics, ownership, performance requirements, or compatibility constraints remain ambiguous.

Do not use implementation behavior as a substitute for a missing contract.
Send that gap to the quality workflow when it blocks safe simplification.

For duplication candidates, distinguish required semantic agreement from coincidental similarity.
Ask: if one copy changes independently, is the other now incorrect, or could both legitimately differ?
When correctness requires agreement, prefer one authoritative definition or derivation even for a small constant or expression.
Where direct sharing across languages, generated interfaces, or deployment boundaries is impractical, document the agreement and use generated representations or focused consistency and compatibility checks.
Do not introduce an inappropriate dependency merely to share a constant.

Do not unify independently evolving responsibilities just because their current code or values match.
Retain small duplication when inline code is clearer and simpler, avoids false coupling, and preserves testability.
Test the owning behavior; extracting a helper only to test it does not establish that its consumers use it correctly.
Keep regression expectations independent where deriving them from production logic or constants would hide the defect being tested.
For example, a test of a required wire value should not obtain its expected value solely from the production constant whose accidental change it must detect.

## Repair a Candidate

Make the smallest coherent change that realizes the confirmed maintenance benefit.
Give each repair one primary category and one independently explainable purpose.
Split independently valid changes into separate validated commits; do not create a category-sized commit of unrelated cleanups.

- Preserve public APIs unless the approved scope explicitly permits an API change.
- Keep distinct implementations when they encode different platform, failure, persistence, or performance guarantees.
- Reuse an existing owner before extracting a new shared helper.
- Place a new shared abstraction at the narrowest layer that owns the common responsibility.
- Remove obsolete code, tests, documentation, features, and dependencies as one coherent repair when their ownership is established; do not bundle unrelated cleanup.
- When removing a test named by an inherited quality inventory, link a surviving test that discriminates the same owning decision or record the approved contract change.
- Do not add tests solely because code moved.
- Add or adjust focused tests when existing evidence does not protect the behavior through the new owner.
- Update contracts when responsibility moves, without promising incidental implementation details.
- Check performance when the change affects allocation, copying, synchronization, storage, transport, or a measured hot path.

Compare the final diff with the approved source commit.
Inspect whether complexity was removed, merely renamed, or displaced.

### Keep Changes Reviewable

- For implementation cleanup, keep existing test expectations stable.
- For test cleanup, leave production behavior unchanged.
- When existing tests do not establish required behavior for a production change, first add characterization tests and demonstrate them against the pre-change implementation; then simplify in a separate checkpoint.
  Do not use those tests to turn incidental behavior into a contract.
- Isolate mechanical moves and renames from logic or prose rewrites where practical.
- For abstraction changes, use one structural hypothesis per checkpoint with only the supporting edits needed to keep callers, tests, and documentation coherent.

Validate test-only cleanup against unchanged production code and map original behavioral cases and discriminating assertions to their replacements.
Check that test discovery, parameter enumeration, feature flags, and platform gates still execute the intended cases.
For substantial test restructuring, use proportionate negative evidence, such as replaying a known regression or a focused mutation, to check that replacements still detect the relevant failure.
Passing both old and new tests does not establish equivalent regression protection; routine fixture cleanup does not require mutation testing.

Do not force a split that leaves intermediate commits broken.
When a coherent repair must touch other categories, explain the coupling and show that test changes adapt to structure rather than conceal changed behavior.
Keep optional test refactoring and other incidental improvements in separate repairs under the approved profile.
Order checkpoints by dependency, and validate and review each before dependent work builds on it.
Preserve independently validated checkpoints through integration, or retain an accessible ordered patch series with its validation and review evidence.
Do not describe an aggregate diff as mechanical merely because one constituent checkpoint was mechanical.
When a later repair changes assumptions used by earlier validation or review, identify the affected evidence and repeat the relevant validation and review before acceptance.
Recheck the affected boundaries, not the whole codebase by default; this does not waive applicable canonical validation gates.

Treat code relocation as lossless by default.
Preserve the complete implementation, documentation comments, implementation comments, attributes, and relevant surrounding context.
Keep comments attached to the correct declarations or code, and adapt documentation links to preserve their targets.
Do not shorten, discard, or clean up comments incidentally during a move.
Separate independently useful documentation edits into their own repair; if relocation makes a comment inaccurate, make only the necessary adaptation and record why.

### Independently Challenge Each Checkpoint

Use the [checkpoint-review skill](../checkpoint-review/SKILL.md) for fresh read-only review against a fixed checkpoint-start commit before an authorized checkpoint commit.
Apply this gate to sequential repairs as well as parallel workstreams; it does not authorize a parallel iteration or a commit.
Use its evidence capture, review depth, and bounded repair/review process rather than creating a second review protocol.
Small related mechanical changes may share a checkpoint; structural abstraction changes need individual scrutiny.

Supply the approved category profile, supporting-edit rationale, and the following clarity and category safeguards as explicit acceptance criteria alongside the shared review criteria.
Require a concrete maintenance benefit without materially degrading readability, clarity, discoverability, or local diagnosis.
Compare how a maintainer understands the original and revised versions, not just their size.
Challenge added indirection, dense expressions, hidden assumptions, and extra navigation needed to understand the same responsibility.
A material clarity regression blocks acceptance even when behavior is unchanged; Structural ambition does not waive this requirement.
Identify what became harder to understand, where, and why; keep personal stylistic preferences separate as optional suggestions.

For documentation and comment changes, apply the [Documentation Guidelines](../../../docs/content/Guidelines/Documentation-Guidelines.md) and the linked guides relevant to the language and format.
Use those sources for writing conventions rather than duplicating their rules here.

Have the same checkpoint reviewer apply the quality skill's [Focused Contract-Preservation Review](../rust-service-quality-iteration/SKILL.md#focused-contract-preservation-review) when a repair affects contracts, behavior, or regression evidence.
This includes documentation and test cleanup, not only ownership changes.
Supply the fixed checkpoint base and before-and-after sources so the reviewer can detect guarantees lost even when the final documentation and tests agree.
Use only that read-only assessment within the current checkpoint scope; do not initiate quality configuration, a separate audit or inventory, or another reviewer.
Retain findings and requested checks in the checkpoint report, distinguishing introduced regressions from pre-existing gaps.

Apply these review prompts to the primary category and every supporting category touched, including necessary edits in an Off category.
Assess the fixed-base diff and relevant consumers; record material findings and evidence gaps, not a rote checklist of assurances.

| Category | Review challenges |
| --- | --- |
| Documentation | Were qualifications or normative requirements lost? Are terms precise and consistent? Do links reach authoritative explanations without removing necessary local context or making information harder to find? |
| Tests | Are the original cases and discriminating assertions preserved and still executed? Does substantial restructuring have evidence that relevant failures are still detected? Do shared fixtures or table-driven helpers hide expectations, introduce shared state, or obscure failures? Would sharing expected values with production hide regressions? |
| Implementation | Are edge cases, evaluation order, errors, side effects, resource lifetimes, concurrency, and performance preserved? Is control flow still easy to follow? Were test expectations changed to accommodate a regression? |
| Abstractions | Does correctness require copies to agree, or is their similarity coincidental? Is required agreement owned or enforced rather than independently maintained? Were distinct guarantees collapsed or independently evolving responsibilities coupled? Would retaining small duplication be clearer while preserving testability? Does sharing reduce concepts or add indirection and configuration? |
| Code organization | Is relocation lossless under the safeguards above? Compare original and destination content against the fixed checkpoint base, including complete documentation and implementation comments and their attachment to code. Account for every omission and non-mechanical change. Check visibility, dependency direction, initialization, build inclusion, generated consumers, and documentation links. Is the destination a better owner rather than merely a smaller file? |
| Naming | Does the name describe the actual responsibility more precisely and read clearly at call sites? Is it consistent across callers and documentation? Could the rename affect public APIs, serialized names, reflection, or generated bindings? |

Passing tests or Git rename detection does not establish lossless relocation.
Across all categories, check whether complexity was removed or displaced, whether semantic agreement is maintained without false coupling, whether unrelated cleanup obscures the diff, and whether the repair exceeds its profile, ownership, or API constraints.
Verify that integration preserves checkpoint evidence and that later changes have not invalidated the evidence used for acceptance.

Require evidence, not an adversarial finding quota.
Rejecting or deferring a repair is a valid outcome; do not weaken the acceptance criteria to obtain approval or silently extend the review allowance.
Record findings, dispositions, validation, and the final checkpoint decision in the existing report.

## Parallel Work

Within an explicitly authorized parallel iteration:

1. Partition discovery by non-overlapping crate or responsibility ownership.
2. Let workstreams report cross-crate candidates without editing shared owners.
3. Select bounded repairs after comparing discovery and assessment results, then redispatch them to the pre-registered owning workstreams.
   Keep the approved discovery and assessment coverage independent of the repair limit.
4. Run crate-local, dependency-independent repairs concurrently, with category-focused checkpoints in each owning workstream.
5. Assign cross-crate consolidation, shared dependencies, workspace manifests, generated bindings, and public contracts to explicit later-wave owners registered at kickoff, or defer them to a follow-on iteration.
6. Apply the checkpoint challenge review before dependent work, then review integrated repairs for behavior preservation and complexity displacement.

Do not have multiple workstreams independently create competing common abstractions.
Do not partition solely by simplification technique when that causes overlapping file ownership.
Keep ownership-based workstreams rather than assigning overlapping documentation, naming, and implementation work to separate agents.

## Evidence and Dispositions

A candidate may be:

- **simplified** when accidental complexity was removed within one owner;
- **consolidated** when duplicate responsibility now has one clear owner;
- **deleted** when an unused path, abstraction, dependency, or test was removed;
- **already proportionate** when the current structure is justified by distinct responsibilities;
- **deferred** when the opportunity is plausible but blocked or outside budget;
- **excluded** when simplification would be low value or violate configured constraints; or
- **rejected** when evidence disproves the proposed duplication or unnecessary complexity.

Every disposition needs direct evidence.
Distinguish candidates not yet assessed from assessed candidates deferred because repair is blocked or outside budget.
An unreviewed area is incomplete coverage, not an `already proportionate` result or a deferred repair.
Budget exhaustion is not a justified exclusion.
For accepted changes, record:

- the primary category, profile level, necessary supporting edits, and why they belong in the repair;
- the preserved contract or meaning and category-appropriate safety evidence;
- the concrete maintenance benefit, including any responsibility or mechanism removed;
- production additions and deletions, plus more meaningful structural measures when available;
- dependencies, types, branches, states, implementations, or public items removed;
- any code moved into another crate or generated artifact;
- performance evidence when relevant;
- focused and canonical validation results; and
- checkpoint base and reviewed state, independent review findings and dispositions, and accepted commit when authorized.

Net line reduction is neither required nor sufficient.
Documentation or focused-test additions can be justified when production ownership becomes smaller and clearer.

## Maintain the Simplification Inventory

For sequential work, retain configuration, area coverage, candidates, dispositions, and validation in the local report.
Apply the completion checks below to both sequential reports and parallel inventories.
The numbered inventory setup and validator apply only to explicitly authorized parallel iterations.

Initialize the normal coordination records, then create `rust-service/historical/iterations/NNNN/simplification-inventory.md`:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-simplification NNNN
```

Workstreams report candidate rows.
The integrator reconciles them into the iteration inventory.
Use stable candidate identifiers where practical.

At completion, verify that:

- every scoped crate or responsibility area is accounted for, including evidence-backed no-change results where no worthwhile candidates were found;
- actual discovery and assessment coverage matches the approved commitment, with unreviewed areas and candidates separate from assessed-but-unrepaired candidates and justified exclusions;
- every active workstream in a parallel iteration is represented;
- every accepted change links its contract, safety evidence, and validation;
- every accepted change fits the category profile and has completed checkpoint review with no unresolved blocking findings;
- every removed test cited by an inherited quality inventory maps to surviving discriminating evidence or an approved contract change;
- cross-crate candidates have one owner or a revisit trigger;
- reductions are not double-counted across workstreams;
- moved code is not reported as deleted;
- unresolved candidates have concrete revisit triggers; and
- the status is `complete` only after the approved coverage and final dispositions are reconciled, including when explicit repair deferrals remain.

Do not mark promised full-scope coverage complete while scoped areas or material candidates remain unreviewed unless the user explicitly approves reduced coverage.
Record that approval and the remaining gaps; do not describe the reduced coverage as full scope.

For a parallel iteration, then run:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-simplification NNNN
```

The validator checks structure, required headings, template markers, title, status, and the presence of a reviewed-candidate row.
If no worthwhile candidates were found, use an evidence-backed area-level `already proportionate` row rather than a fabricated candidate.
Reviewers must verify the approved coverage, workstream coverage, measurements, behavior preservation, and convergence against the reports and diff.

## Assess Convergence

A run is converging when it removes confirmed accidental complexity, rejects weak candidates without repeated investigation, avoids introducing replacement abstractions, and leaves fewer material candidates within the approved scope.

Recommend another run only when:

- material deferred candidates have a useful next scope;
- accepted work exposes a specific follow-up consolidation;
- changed ownership makes a later dependency or abstraction removable;
- independent review finds displaced complexity; or
- the user approves a broader or renewed current-state review.

Stop when another run within the declared scope and budget is unlikely to produce a meaningful reduction.
This convergence rule does not end the current run's promised discovery and assessment early.
A well-supported no-change result is evidence that the reviewed structure is proportionate.

## Validate

Use focused checks while repairing each candidate and all applicable canonical commands from `rust-service/DEVELOPMENT.md`.
For sequential work, record the checks in the local report.
For parallel iterations, also follow the coordination skill's validation, integration, and Phase 3 requirements.

At closeout, confirm that affected contracts, behavior, and regression evidence received focused contract-preservation review.
Recheck boundaries whose evidence changed after checkpoint review; reuse accepted evidence for unchanged boundaries rather than initiating a second audit.
