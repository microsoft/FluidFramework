---
name: rust-service-quality-iteration
description: 'Design and run a periodic, risk-driven Rust-service quality iteration that audits documented behavioral contracts and localized regression tests, records reviewed boundaries and unresolved findings, and converges without coverage or documentation churn. Use when configuring, executing, reviewing, or repeating a Rust code-quality audit across one or more rust-service crates.'
argument-hint: 'configure or run a Rust-service contract and test quality audit'
---

# Rust Service Quality Iteration

Use this workflow to find and repair consequential documentation and behavioral test gaps.
Read `rust-service/DEVELOPMENT.md` for the quality bar and validation requirements.
For a read-only contract-preservation check inside an existing change review, use only [Focused Contract-Preservation Review](#focused-contract-preservation-review) and its referenced assessment criteria.
That entry point does not start a quality audit or use the run-configuration workflow below.
Configure scope, coverage budget, and execution structure as separate choices, in that order.
Explicitly ask whether to use a parallel iteration unless the user has already chosen an execution structure.
Selecting the parallel-iteration option is explicit authorization to load `.github/skills/rust-service-coordination/SKILL.md` for iteration mechanics.
Do not load it merely to ask the configuration question.
The numbered-record, workstream, integration, and Phase 3 instructions below apply only in that case.
Otherwise retain the audit configuration, findings, and evidence in an existing local report without creating iteration machinery.
If no suitable report exists, create one local audit report in the repository's documentation location for the affected area and reuse it throughout the audit.

## Relationship to Simplification Iterations

When both workflows are planned, complete and integrate this quality iteration first.
Run the simplification iteration from that accepted commit and use the quality inventory as safety evidence.
Do not run broad quality and simplification iterations concurrently against moving versions of the same code.

During simplification checkpoint review, use [Focused Contract-Preservation Review](#focused-contract-preservation-review) for changed and directly affected contracts, behavior, or regression evidence, including documentation and test edits.
At closeout, recheck affected boundaries whose evidence changed after checkpoint review; do not repeat accepted reviews or start a broader quality run without justification and approval.
Use the [simplification-iteration skill](../rust-service-simplification-iteration/SKILL.md) for current-state deduplication, consolidation, and accidental-complexity reduction.

## Principles

- Audit behavior and responsibility boundaries, not comment counts, test counts,
  line coverage, or declarations in bulk.
- Prioritize by consequence, regression likelihood, implementation complexity,
  change history, cross-component reliance, and weakness of existing evidence.
- Treat accurate documentation plus proportionate existing tests as a valid
  no-change result.
- Prefer focused tests in the owning module or crate. Use conformance tests for
  laws shared by implementations and broader tests only for distinct crate,
  process, transport, generated-binding, or platform boundaries.
- Do not duplicate an assertion at multiple layers unless each failure localizes
  a different responsibility.
- Do not turn incidental implementation behavior into a contract merely because
  it is easy to test.
- Preserve reviewed boundaries, accepted evidence, unresolved findings,
  exclusions, and revisit triggers so later runs build on prior work.

## Configure One Run

### Confirm the Scope

Before auditing boundaries or initializing records, propose a scope, explain the reason for it, and ask the user to confirm or customize it.
Offer these starting modes, allowing combinations and explicit exclusions, without bundling a review-count or repair budget into the choices:

- **Incremental:** Prioritize recent changes, unresolved findings, and recorded revisit triggers.
- **Full reassessment:** Make every boundary in the selected crates or responsibility scope eligible, including unchanged and previously accepted boundaries.
- **Targeted:** Review user-selected crates, behaviors, or concerns, regardless of change history or prior dispositions.

When no scope is supplied, propose incremental review with the relevant prior inventory and change window, if available; do not silently assume approval.
Make the crate or responsibility scope explicit, including an all-Rust-service-crates option when no narrower area was requested.
An all-crate reassessment includes unchanged code; it is not a review limited to the current diff.
If the user already supplied an explicit scope, restate it briefly without redundant confirmation, then resolve the remaining configuration choices.
Scope confirmation alone does not authorize parallel execution or iteration setup.

For full or targeted reassessments, retain prior inventories as evidence, but treat their conclusions as hypotheses to recheck rather than reasons to skip inspection.
Record the user's request to revisit the area, improved skill guidance, or improved agent models as the reassessment trigger, as applicable.

### Choose Coverage And Budget

After scope selection, estimate the effort needed to cover it using crate listings, prior inventories, and a lightweight responsibility map.
This estimate is configuration work, not a completed boundary audit.
Explain whether the proposed default budget covers the whole selected scope or only a risk-ranked sample.
Never silently turn "full reassessment" or "all crates" into a fixed three-boundary audit.

If the default budget cannot cover everything in scope, ask the user to choose:

- **Review everything in scope:** Inspect every in-scope crate and its consequential responsibility boundaries, without a fixed boundary-count or time cutoff.
- **Use the bounded default:** State the proposed effort limit and expected coverage, explicitly noting what will remain unreviewed.
- **Choose a custom budget:** Let the user set effort or coverage limits before work starts.

If the default is sufficient, state the estimate and confirm it unless the user already authorized it.
Use separate questions for scope, budget, and execution structure; do not ask one bundled approval question.
Record repair limits separately from review coverage.
Reaching a repair limit must not stop an authorized full-scope review: continue inspection and record additional confirmed gaps as deferred repairs.
Reviewing everything does not promise finding every defect, documenting every declaration, or repairing every finding.

For full-scope review, account for every selected crate or responsibility area and its consequential boundaries.
Use risk ranking to order the work, not to omit lower-ranked areas.
Stop when that coverage is complete, or disclose a blocker and ask before reducing coverage or imposing a new cutoff.
For bounded review, stop at the approved limit and distinguish reviewed boundaries from unreviewed candidates.
Ask before expanding scope or a bounded budget.

### Choose Sequential Or Parallel Execution

After scope and budget are agreed, explicitly ask: "Should this quality audit use the parallel Rust-service iteration structure?"
Offer:

- **Parallel iteration:** Numbered records, isolated workstreams, a shared quality inventory, integration, and Phase 3 review under the coordination skill.
- **Sequential audit:** One local report, with the same approved scope and coverage budget.

Recommend parallel execution when the selected scope has substantial independent work, but let the user choose.
Do not infer sequential execution from a small diff or from the absence of the words "parallel iteration" in the initial request.
If the user already explicitly selected either structure, or is continuing an authorized run, preserve that choice without asking again.
Only after a parallel selection, load the coordination skill and follow its setup requirements.

### Record the Configuration

Before initializing records, agree with the user on these run-specific inputs:

- approved source commit;
- review mode or combination, Rust crate or responsibility scope, and exclusions;
- reassessment trigger, when revisiting previously accepted boundaries;
- risk priorities or recent-change window;
- coverage commitment (full scope or bounded sample), estimated effort, and any approved effort limits;
- repair budget, separate from review coverage;
- sequential audit or explicitly authorized parallel iteration;
- stopping conditions;
- inherited quality inventory, if any;
- required validation beyond the canonical gates; and
- independent review needs.

For sequential audits, put these inputs in the local audit report.
For an explicitly authorized parallel iteration, put them in its charter and workstream instructions.
Do not copy the general quality bar or audit method into these records. Do not include private
evaluation expectations, seeded defects, expected findings, or expected test
locations in records or prompts supplied to workstream agents.

## Build a Risk Map

Use repository evidence to rank candidate responsibility boundaries within the
configured scope. Relevant evidence includes:

- recent bug fixes and behavior changes;
- code paths with cancellation, concurrency, recovery, retries, lifecycle, or
  failure-isolation semantics;
- persistence, protocol, parsing, limits, authorization, and state-transition
  boundaries;
- traits or shared functions with multiple implementations or distant callers;
- broad integration tests that exercise behavior with no apparent focused
  owning-crate coverage;
- complex implementation branches whose caller-visible behavior is weakly
  documented;
- prior unresolved findings or explicit revisit triggers; and
- repeated defects or costly diagnosis recorded in iteration history.

Do not assume that recent change implies a defect or that old code is safe.
Use history to select where inspection has value, then judge the current
contract and evidence on their merits.

Record why earlier boundaries outrank later or deferred candidates.
For full-scope review, map every selected crate or responsibility area to its review owner and consequential boundaries; do not select only the highest-risk subset.
For sequential audits, inspect those boundaries in priority order within the approved budget.
Only within an explicitly authorized parallel iteration, partition active
workstreams by non-overlapping crate or responsibility ownership. Prefer
dependency-independent workstreams in the same wave. Use a later review wave
when independent assessment of accepted repairs is worth its cost.

## Audit a Boundary

For each selected boundary:

1. Identify the component that owns the behavior and the consumers that rely on
   it.
2. State the behavior those consumers need, then locate the contract that
   promises it. Distinguish a missing promise from behavior consumers should
  stop assuming. Quote or link the precise contract text; implementation and
  test behavior are evidence of what code does, not substitutes for a promise.
3. Locate existing focused, conformance, integration, generated-binding, and
   platform evidence. State the distinct responsibility of each useful layer.
  For each candidate test, identify the exact owning decision whose regression
  would make it fail. Do not count topical coverage when another component can
  satisfy the assertion while the candidate behavior remains broken.
4. Form one falsifiable quality finding: missing or inaccurate contract,
   missing owning-layer regression evidence, misplaced broad-only evidence,
   redundant evidence, or adequate existing coverage.
5. Use the cheapest discriminating check to confirm or reject the finding.
6. For a confirmed material gap, make the smallest repair that documents the
   needed contract and tests the responsible behavior at the narrowest practical
   layer.
7. Validate the focused test. When practical, demonstrate that it fails for the
   defective behavior or otherwise explain why it is a valid regression guard.
8. Retain or add broader evidence only when it proves a distinct boundary.
9. Record the result in the local audit report, or in the workstream report and quality inventory for a parallel iteration.

Do not expand from one finding into unrelated cleanup.
Ask for guidance on unresolved shared semantic or ownership choices and follow the repository's decision-record requirements.
Within an explicitly authorized parallel iteration, also follow its coordination rules.

## Evidence for Dispositions

A finding may be:

- **repaired** when the owning contract and proportionate test evidence are
  accepted and validated;
- **already adequate** when current contracts and tests cover the risk with no
  material gap. Name the exact owning decision and the nearest test that would
  fail if only that decision regressed. If no such test exists and focused
  coverage is practical, the evidence is not already adequate. Separately
  identify the precise contract text and whether failure diagnoses the owning
  implementation locally. A shared conformance invocation does not replace a
  practical owner-local regression test merely because it eventually fails;
- **consumer corrected** when code was relying on behavior the owning contract
  should not promise;
- **deferred** when the gap is real but outside the run budget or blocked, with a
  concrete revisit trigger;
- **excluded** when additional documentation or testing would be low value, with
  rationale; or
- **rejected** when the discriminating check falsifies the proposed gap.

Every disposition needs direct evidence. "No time" is not an exclusion
rationale; it is a deferral with remaining risk.

## Focused Contract-Preservation Review

Use this read-only assessment within an existing change review, including simplification checkpoints.
The invoking workflow supplies the fixed comparison base, changed state, approved scope, permitted behavior changes, and review evidence.
It remains responsible for reviewer assignment, command execution, findings, and repair decisions.
Do not run this skill's configuration questions, initialize an audit or inventory, spawn another reviewer, or execute its repair steps.
Return findings and requests for focused checks through the existing review workflow and report.

Use the identification and evidence criteria in [Audit a Boundary](#audit-a-boundary) and [Evidence for Dispositions](#evidence-for-dispositions), not their repair instructions.
Limit assessment to changed and directly affected boundaries.
For each affected boundary, compare this relationship before and after the change:

**Consumer requirement -> documented contract -> implementation -> discriminating test**

Identify the owner and consumers, quote or link the precise contract, and name the owning decision whose regression the test would detect.
Inspect both the fixed-base and changed versions; agreement among the final documentation, implementation, and tests can still conceal a dropped guarantee.
Check whether:

- documentation edits weaken a guarantee, broaden a promise, remove a precondition, or change the apparent owner;
- replacement tests still protect the same promised behavior at the responsible boundary, rather than merely exercising related functionality;
- implementation or abstraction changes preserve the contract and the test's ability to detect failure of the owning decision; and
- moves or renames preserve the contract's association with its owner and its discoverability.

Keep evidence proportional to the semantic risk.
A punctuation-only edit does not require new behavioral tests; changes to error, ordering, cancellation, or other guarantees require inspection of the affected contract and evidence.
Missing contracts or ambiguous semantics are evidence gaps, not permission to infer promises from implementation or tests.
Do not silently rewrite a contract or weaken assertions to make the final state agree.

Distinguish introduced regressions and unapproved semantic changes from pre-existing gaps.
Report a regression or a gap that prevents establishing preservation as blocking under the invoking workflow's acceptance criteria.
Record unrelated pre-existing gaps for follow-up without expanding this review into a broad audit.
Return inspected boundaries, before-and-after contract and test references, material findings, unresolved evidence gaps, and requested checks in the existing report.

## Maintain the Quality Inventory

For sequential work, retain the configuration, reviewed boundaries, dispositions, and validation evidence in the local audit report; do not create a numbered inventory.
The remaining setup and reconciliation steps in this section apply only to explicitly authorized parallel iterations.
First initialize the normal records with the coordination skill's `init NNNN workstream-name...` command.
Then create `rust-service/historical/iterations/NNNN/quality-inventory.md` from
[the quality inventory template](./assets/quality-inventory.template.md) before committing the kickoff records:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-quality NNNN
```

`init-quality` adds only the inventory; it does not replace `init` or create the charter, manifest, or workstream instructions.

Workstreams report their rows; the integrator reconciles them into the iteration
copy and Phase 3 accepts its final dispositions.

The inventory is not a declaration checklist. Use one row per consequential
behavioral or responsibility boundary reviewed. Keep stable boundary identifiers
where practical so later runs can update rather than duplicate entries.

For a later incremental run, carry forward unresolved findings, changed boundaries, and explicit revisit triggers as candidates.
This default candidate set does not restrict a user-approved full or targeted reassessment.
Preserve completed iteration inventories as immutable history.

## Integrate and Review

For both sequential audits and parallel iterations, verify the following against the local report or quality inventory.
Parallel iterations also require the coordination skill's normal Phase 2 checks.

- each accepted change names the behavior and owning contract;
- each changed production crate has focused evidence or a defensible rationale;
- each `already adequate` disposition identifies a test that discriminates the
  exact owning decision, or explains why the narrowest practical evidence must
  cross a broader boundary;
- each relied-upon behavior links precise contract text rather than inferring a
  promise from implementation or tests, and shared conformance is not accepted
  as owner-local diagnosis when a focused implementation test is practical;
- conformance tests describe implementation-independent laws;
- integration and browser tests prove distinct boundaries;
- tests are deterministic and fail diagnostically;
- documentation does not over-promise implementation details;
- accepted changes contain no unrelated cleanup; and
- inventory dispositions match the actual diff and validation.

Reconcile actual coverage with the approved commitment.
A full-scope run must account for every selected crate or responsibility area, including no-change results, reviewed exclusions with rationale, and any blocked review.
An unreviewed area is incomplete coverage, not an adequate result or a deferred repair.
Do not label a full-scope review complete while review areas remain unreviewed unless the user explicitly approves reduced coverage.

When independent review is part of the approved audit scope, the reviewer should inspect the resulting evidence without
receiving expected findings. It may challenge dispositions and identify missed
high-risk boundaries, but it must use the same configured scope and budget.

## Assess Convergence

At sequential audit closeout or parallel iteration Phase 3, compare this run with the inherited report or inventory and recent change
history. A quality run is converging when it reduces material unresolved risk,
does not recreate previously reviewed work without a trigger, and adds little or
no redundant documentation or testing.

A user-approved reassessment, including one motivated by skill or model improvements, is a valid revisit trigger even when the code has not changed.
Judge convergence against the confirmed scope and actual reviewed boundaries; do not infer exhaustive coverage from a full-reassessment mode.

Recommend another run only when at least one of these is true:

- material unresolved findings remain within a useful next scope;
- changed or newly discovered boundaries invalidate prior evidence;
- the user requests a full or targeted reassessment, with a recorded revisit trigger;
- independent review found a plausible systematic blind spot; or
- a reusable process improvement has a specific hypothesis worth testing.

Stop when another run within its declared scope and budget finds no material new
deficiency. A no-change run is positive convergence evidence when its reviewed
boundaries and checks are recorded. Do not manufacture changes to demonstrate
activity.

## Validate

Use focused checks during the audit and all applicable canonical commands required by `rust-service/DEVELOPMENT.md`.
For sequential audits, record the checks and final dispositions in the local audit report, including unresolved items and their revisit triggers.
The remaining validation steps apply only to explicitly authorized parallel iterations, which also follow the coordination skill's validation requirements.
Validate the iteration records at start, Phase 2, and completion with `iteration-records.mjs`.

Before completing Phase 3, verify that `quality-inventory.md` has no placeholder
rows, every active workstream is represented, every unresolved item has an owner
or revisit trigger, and every accepted repair links its contract, tests, and
validation evidence.
Set the inventory status to `complete` after reconciling the final dispositions and satisfying the approved review coverage, including any explicit repair deferrals.
Then run:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-quality NNNN
```

The inventory validator checks required headings, template markers, the title, an allowed status, and the presence of a table data row.
It does not verify workstream coverage, disposition evidence, convergence, or that the status is `complete` at closeout; reviewers must check those requirements against the reports, diff, and command output.
