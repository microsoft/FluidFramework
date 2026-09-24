---
name: rust-service-simplification-iteration
description: 'Design and run a Rust-service simplification iteration that finds and removes accidental complexity, duplication, unnecessary abstractions, state, dependencies, and dead paths while preserving documented behavior and proportionate regression evidence. Use when configuring, executing, reviewing, or repeating simplification, consolidation, deduplication, code-size reduction, or broad cleanup across rust-service crates.'
argument-hint: 'configure or run a Rust-service simplification and consolidation audit'
---

# Rust Service Simplification Iteration

Use this workflow to make the current Rust-service implementation smaller and easier to understand without weakening its behavior, diagnostics, performance, or supported platforms.
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
3. perform focused quality review of boundaries whose ownership changed.

Do not run broad quality and simplification iterations concurrently against moving versions of the same code.
The quality iteration identifies behavior that consumers rely on.
The simplification iteration uses those contracts and tests as safety evidence.

A prior quality inventory is useful but not mandatory.
Without one, each simplification candidate must establish the relevant contract and the nearest discriminating test before production edits begin.
If responsibility or required behavior cannot be determined, defer the candidate to a quality audit instead of guessing.

## Principles

- Simplify the current implementation; do not infer a defect from historical growth.
- Preserve required behavior, useful diagnostics, performance characteristics, and platform support.
- Prefer deletion and reuse over moving complexity or introducing a more general abstraction.
- Count a consolidation only when it leaves one clear owner and removes competing implementations.
- Require evidence of accidental complexity before editing.
- Treat generated code, explicit error handling, platform-specific implementations, and distinct test layers as intentional until evidence shows otherwise.
- Do not optimize source-line count at the cost of readability, type safety, failure isolation, or local diagnosis.
- Do not add speculative extension points while removing existing complexity.
- Preserve rejected candidates and no-change results so later runs do not repeat low-value work without a revisit trigger.

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

### Choose Coverage And Budget

After scope selection, estimate the effort needed using crate listings, prior inventories, and a lightweight responsibility map.
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
- inherited quality and simplification inventories, if any;
- risk priorities;
- discovery and assessment coverage commitment (full scope or bounded sample), estimated effort, and any approved limits;
- repair budget, separate from discovery and assessment coverage;
- sequential review or explicitly authorized parallel iteration;
- stopping conditions and discovery/repair waves;
- permitted public API, dependency, protocol, generated-binding, and performance changes;
- required validation beyond the canonical gates; and
- independent review needs.

For sequential work, put these inputs in the local report.
For an explicitly authorized parallel iteration, put them in the charter, workstream instructions, and simplification inventory.

## Discover Candidates

Use repository evidence and code intelligence to find:

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

1. Identify the responsibility, owning component, consumers, and supported platforms.
2. Link the precise contracts consumers rely on.
3. Identify the nearest tests that discriminate the behavior being preserved.
4. State a falsifiable simplification hypothesis, such as removing one state representation, dependency, implementation, conversion, or branch family.
5. Map callers and implementations before editing.
6. Use the cheapest check that can reject false duplication or reveal a distinct responsibility.
7. Estimate the expected reduction and name any likely displacement into another module or crate.
8. Defer the candidate if semantics, ownership, performance requirements, or compatibility constraints remain ambiguous.

Do not use implementation behavior as a substitute for a missing contract.
Send that gap to the quality workflow when it blocks safe simplification.

## Repair a Candidate

Make the smallest coherent change that realizes the confirmed reduction.

- Preserve public APIs unless the approved scope explicitly permits an API change.
- Keep distinct implementations when they encode different platform, failure, persistence, or performance guarantees.
- Reuse an existing owner before extracting a new shared helper.
- Place a new shared abstraction at the narrowest layer that owns the common responsibility.
- Remove obsolete code, tests, documentation, features, and dependencies together when their ownership is established.
- When removing a test named by an inherited quality inventory, link a surviving test that discriminates the same owning decision or record the approved contract change.
- Do not add tests solely because code moved.
- Add or adjust focused tests when existing evidence does not protect the behavior through the new owner.
- Update contracts when responsibility moves, without promising incidental implementation details.
- Check performance when the change affects allocation, copying, synchronization, storage, transport, or a measured hot path.

Compare the final diff with the approved source commit.
Inspect whether complexity was removed, merely renamed, or displaced.

## Parallel Work

Within an explicitly authorized parallel iteration:

1. Partition discovery by non-overlapping crate or responsibility ownership.
2. Let workstreams report cross-crate candidates without editing shared owners.
3. Select bounded repairs after comparing discovery and assessment results, then redispatch them to the pre-registered owning workstreams.
   Keep the approved discovery and assessment coverage independent of the repair limit.
4. Run crate-local, dependency-independent repairs concurrently.
5. Assign cross-crate consolidation, shared dependencies, workspace manifests, generated bindings, and public contracts to explicit later-wave owners registered at kickoff, or defer them to a follow-on iteration.
6. Independently review accepted repairs for behavior preservation and complexity displacement.

Do not have multiple workstreams independently create competing common abstractions.
Do not partition solely by simplification technique when that causes overlapping file ownership.

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

- the preserved contract and discriminating tests;
- the concrete responsibility or mechanism removed;
- production additions and deletions, plus more meaningful structural measures when available;
- dependencies, types, branches, states, implementations, or public items removed;
- any code moved into another crate or generated artifact;
- performance evidence when relevant; and
- focused and canonical validation results.

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

After simplification, perform focused quality review when responsibility, contract location, or regression-test ownership changed.
