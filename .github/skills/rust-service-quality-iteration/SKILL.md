---
name: rust-service-quality-iteration
description: 'Design and run a periodic, risk-driven Rust-service quality iteration that audits documented behavioral contracts and localized regression tests, records reviewed boundaries and unresolved findings, and converges without coverage or documentation churn. Use when configuring, executing, reviewing, or repeating a Rust code-quality audit across one or more rust-service crates.'
argument-hint: 'configure or run a Rust-service contract and test quality audit'
---

# Rust Service Quality Iteration

Use this workflow to configure and execute a numbered Rust-service iteration
whose purpose is to find and repair consequential documentation and behavioral
test gaps. Read `rust-service/DEVELOPMENT.md` for the quality bar and
`.github/skills/rust-service-coordination/SKILL.md` for all iteration mechanics,
validation gates, records, branches, worktrees, integration, and Phase 3 rules.
This skill specializes what the iteration investigates; it does not replace or
duplicate the coordination workflow.

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

Before initializing records, agree with the user on these run-specific inputs:

- approved source commit;
- Rust crate or responsibility scope;
- risk priorities or recent-change window;
- effort budget;
- stopping conditions;
- inherited quality inventory, if any;
- required validation beyond the canonical gates; and
- independent review needs.

Put these inputs in that run's charter and workstream instructions. Do not copy
the general quality bar or audit method into them. Do not include private
evaluation expectations, seeded defects, expected findings, or expected test
locations in records or prompts supplied to workstream agents.

Use a full numbered iteration only when independent ownership areas, parallel
audit and repair, or an implementation-to-synthesis boundary provide material
value. Otherwise apply `rust-service/DEVELOPMENT.md` directly as lightweight
work.

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

Record why selected boundaries outrank deferred candidates. Partition active
workstreams by non-overlapping crate or responsibility ownership. Prefer
dependency-independent workstreams in the same wave. Use a later review wave
when independent assessment of accepted repairs is worth its cost.

## Audit a Boundary

For each selected boundary:

1. Identify the component that owns the behavior and the consumers that rely on
   it.
2. State the behavior those consumers need, then locate the contract that
   promises it. Distinguish a missing promise from behavior consumers should
   stop assuming.
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
9. Record the result in the workstream report and quality inventory.

Do not expand from one finding into unrelated cleanup. A surprising shared
semantic or ownership question follows the coordination skill's escalation and
decision-record rules.

## Evidence for Dispositions

A finding may be:

- **repaired** when the owning contract and proportionate test evidence are
  accepted and validated;
- **already adequate** when current contracts and tests cover the risk with no
  material gap. Name the exact owning decision and the nearest test that would
  fail if only that decision regressed. If no such test exists and focused
  coverage is practical, the evidence is not already adequate;
- **consumer corrected** when code was relying on behavior the owning contract
  should not promise;
- **deferred** when the gap is real but outside the run budget or blocked, with a
  concrete revisit trigger;
- **excluded** when additional documentation or testing would be low value, with
  rationale; or
- **rejected** when the discriminating check falsifies the proposed gap.

Every disposition needs direct evidence. "No time" is not an exclusion
rationale; it is a deferral with remaining risk.

## Maintain the Quality Inventory

Create `rust-service/iterations/NNNN/quality-inventory.md` from
[the quality inventory template](./assets/quality-inventory.template.md) during
run initialization with:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-quality NNNN
```

Workstreams report their rows; the integrator reconciles them into the iteration
copy and Phase 3 accepts its final dispositions.

The inventory is not a declaration checklist. Use one row per consequential
behavioral or responsibility boundary reviewed. Keep stable boundary identifiers
where practical so later runs can update rather than duplicate entries.

At completion, carry forward only unresolved findings, changed boundaries, and
explicit revisit triggers as candidates for a later run. Preserve completed
iteration inventories as immutable history.

## Integrate and Review

In addition to the coordination skill's normal Phase 2 checks, verify:

- each accepted change names the behavior and owning contract;
- each changed production crate has focused evidence or a defensible rationale;
- each `already adequate` disposition identifies a test that discriminates the
  exact owning decision, or explains why the narrowest practical evidence must
  cross a broader boundary;
- conformance tests describe implementation-independent laws;
- integration and browser tests prove distinct boundaries;
- tests are deterministic and fail diagnostically;
- documentation does not over-promise implementation details;
- accepted changes contain no unrelated cleanup; and
- inventory dispositions match the actual diff and validation.

An independent review workstream should inspect integrated evidence without
receiving expected findings. It may challenge dispositions and identify missed
high-risk boundaries, but it must use the same configured scope and budget.

## Assess Convergence

Phase 3 should compare this run with the inherited inventory and recent change
history. A quality run is converging when it reduces material unresolved risk,
does not recreate previously reviewed work without a trigger, and adds little or
no redundant documentation or testing.

Recommend another run only when at least one of these is true:

- material unresolved findings remain within a useful next scope;
- changed or newly discovered boundaries invalidate prior evidence;
- independent review found a plausible systematic blind spot; or
- a reusable process improvement has a specific hypothesis worth testing.

Stop when another run within its declared scope and budget finds no material new
deficiency. A no-change run is positive convergence evidence when its reviewed
boundaries and checks are recorded. Do not manufacture changes to demonstrate
activity.

## Validate

Use focused checks during each workstream and all canonical integration commands
required by `rust-service/DEVELOPMENT.md` and the coordination skill. Validate
the iteration records at start, Phase 2, and completion with
`iteration-records.mjs`.

Before completing Phase 3, verify that `quality-inventory.md` has no placeholder
rows, every active workstream is represented, every unresolved item has an owner
or revisit trigger, and every accepted repair links its contract, tests, and
validation evidence. Then run:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-quality NNNN
```
