# Rust Code Quality Improvement Plan

## Status

- **Plan status:** Active.
- **Execution mode:** Serial work on the current branch; this outer plan does not use the numbered iteration workflow.
- **Source commit:** `59836ab4c0fdd20185271236f71c0aa4eccdf930`.
- **Plan commit:** `a09d224464b` (`docs(rust-service): plan code quality workflow`).
- **Last completed phase:** 2. Improve reusable skills and templates.
- **Last validation:** Coordination script syntax, iteration `0013` complete-record validation, documentation links, and `git diff --check` passed on 2026-09-17.
- **Current phase:** 3. Define the reusable quality iteration.
- **Next phase:** 3. Define the reusable quality iteration.

Update this section when completing each phase.
Record the validation performed, retained evidence, decisions, and next phase.

## Purpose

Improve Rust-service documentation and testing practices in two complementary ways:

1. establish durable guidance for ordinary human and agent work; and
2. create a reusable numbered iteration that can periodically find and repair valuable documentation and test gaps across the Rust workspace.

The outer work is intentionally serial.
It designs and evaluates the reusable iteration, while each trial of that workflow is an ordinary numbered Rust-service iteration with its own immutable records.
This avoids nesting one coordinating iteration inside another when the outer work has no useful parallel implementation workstreams.

## Desired Quality Bar

Rust code should depend only on behavior promised by the contract it consumes.
Consequential behavior should be documented at the narrowest boundary that callers rely on and tested near the code responsible for providing it.

Prefer evidence in this order when practical:

1. a focused unit test in the owning module;
2. a focused test elsewhere in the owning crate when private access, fixtures, or test organization make that clearer;
3. a conformance test shared by multiple implementations of one contract;
4. an integration test for behavior that genuinely crosses crate, process, transport, generated-binding, or platform boundaries; and
5. an end-to-end browser test only for confidence that requires a real browser or browser-specific API.

These layers are complementary when they prove different things.
Do not duplicate the same assertion at every layer, pursue coverage counts without a behavioral reason, document implementation details as promises, or add tests whose maintenance cost exceeds the risk they address.

When fixing a bug, inspect every production crate changed by the fix.
Normally, each changed crate should receive the focused tests and contract documentation needed to prevent recurrence or to make its relied-upon behavior explicit.
An omission is acceptable when the behavior is already adequately documented and tested at the owning boundary, or when a more appropriate boundary owns the guarantee; record that reasoning in the change or review evidence.

## Scope

This plan covers:

- Rust source and Rust-facing contracts under `rust-service/`;
- related conformance, integration, generated-binding, and browser tests where they supply necessary boundary evidence;
- durable human guidance in Rust-service documentation;
- reusable agent skills and iteration templates used by Rust-service work; and
- trial iterations used to evaluate and refine the workflow.

This plan does not require exhaustive comments or tests for every line, private helper, or trivial value.
It does not make browser tests the default regression-test location, impose a coverage percentage, or reopen settled architecture without concrete evidence of a quality problem.

## Separation of Responsibilities

### Durable guidance

Put the general quality bar, audit method, test-locality principles, bug-fix expectations, and review questions in reusable documentation, skills, and templates.
Prefer improving skills already invoked by Rust-service implementation and iteration workflows so the lessons apply beyond periodic quality runs.
Add a new reusable skill only when no existing owning skill provides a clear home.

### Per-run configuration

Put only run-specific configuration in a trial run's charter and workstream instructions.
This includes selected scope, risk priorities, budget, stopping conditions, inherited unresolved findings, expected reports, and required validation.
Do not restate or specialize the general quality bar there merely to make one trial succeed.

### Evaluation

The trial workflow must not receive issue-specific expected findings.
Before changing the guidance or running the first trial, pre-register an evaluator checklist based on independently known gaps and retain it outside the repository material supplied to trial agents.
Keep that checklist fixed during a trial series except to correct an objectively ambiguous criterion, and record any correction before evaluating the affected run.

Evaluate both what a trial discovers and the quality of its repairs.
The evaluator is not a substitute for the final engineering review.

## Convergence Principles

Repeated runs should converge toward fewer material undocumented assumptions and fewer meaningful test gaps, not toward more prose and tests indefinitely.

- Prioritize behavior by consequence, likelihood of regression, implementation complexity, change history, and weakness of existing evidence.
- Preserve an inventory of reviewed boundaries, accepted coverage, unresolved findings, and explicit low-value exclusions.
- Subsequent runs consume that inventory and recent change history instead of restarting a workspace-wide enumeration.
- Prefer deletion or consolidation when overlapping tests or documentation no longer provide distinct evidence.
- A run may conclude that no change is warranted when the existing contract and evidence are proportionate to risk.
- Stop a trial series when another run finds no material new deficiency and evaluator results meet the agreed threshold.
- Validate generality against an area not used to design or tune the evaluator before declaring the reusable workflow effective.

## Serial Execution Plan

### 0. Review and approve this plan

- [x] Confirm the outer work remains lightweight serial work under the Rust-service coordination guidance.
- [x] Confirm the private evaluation method without adding issue-specific answers to trial-visible artifacts.
- [x] Agree on the minimum acceptable trial result and convergence threshold.
- [x] Run the documentation checker.
- [x] Commit this plan separately from implementation.

Validation:

```bash
cd rust-service
node scripts/check-documentation.mjs
```

### 1. Establish durable quality guidance

- [x] Refine `DEVELOPMENT.md` with the contract, test-locality, bug-fix, and evidence-layering expectations from this plan.
- [x] Separate durable architectural guidance from the completed execution record in `SEA_API_CLEANUP_PLAN.md` without losing historical evidence.
- [x] Ensure guidance distinguishes public API documentation from internal contracts that callers or sibling components rely upon.
- [x] Explain when conformance, integration, generated-binding, and browser tests add distinct value.
- [x] Document proportionate exceptions and require rationale rather than mechanical test or documentation growth.
- [x] Verify links and terminology.

Completion gate:

Humans can apply the quality bar during an ordinary bug fix without consulting this experiment plan or a prior conversation.

### 2. Improve reusable skills and templates

- [x] Identify the existing skills and templates invoked for Rust-service implementation, workstreams, integration, review, and retrospectives.
- [x] Add contract and localized-regression evidence to those reusable surfaces where it affects their responsibility.
- [x] Make workstream and integration reports record the behavioral contract, owning test layer, broader boundary evidence, and rationale for omissions.
- [x] Teach review and synthesis to detect tests placed only at a broad integration layer when a lower owning layer is practical.
- [x] Keep run-specific scope and budgets out of reusable quality rules.
- [x] Validate skill and template consistency using their existing checks.

Completion gate:

An ordinary Rust-service implementation or bug-fix workstream is prompted to document relied-upon behavior and add proportionate owning-layer regression coverage even when no quality-audit iteration is running.

### 3. Define the reusable quality iteration

- [ ] Define a risk-driven audit workflow that samples consequential Rust boundaries instead of enumerating declarations or maximizing coverage.
- [ ] Define discovery, prioritization, implementation, independent review, and synthesis workstreams only where they are genuinely independent.
- [ ] Define the reviewed-boundary and unresolved-finding inventory consumed by later runs.
- [ ] Define evidence requirements for accepting a finding, a repair, an exception, or a no-change conclusion.
- [ ] Define budgets and stopping conditions that prevent low-value documentation or test churn.
- [ ] Reference the durable skills and templates rather than copying their guidance into the workflow.
- [ ] Add or update validation for the reusable iteration artifacts.

Completion gate:

A coordinator can configure a run by selecting scope, priorities, budget, and inherited findings without rewriting the audit method or quality bar.

### 4. Pre-register evaluation and run the first trial

- [ ] Freeze the private evaluator checklist and scoring or pass criteria before creating trial instructions.
- [ ] Record the source commit and ensure the trial starts from an approved clean state.
- [ ] Configure a neutral workspace-quality run without naming known bugs, commits, expected findings, or expected test locations.
- [ ] Initialize and execute the trial through the normal numbered iteration workflow.
- [ ] Preserve its reports, decisions, accepted commits, rejected findings, validation, and costs.
- [ ] Evaluate the completed result against the private checklist only after the trial reaches its immutable completion boundary.

Evaluation dimensions:

- discovery of consequential undocumented or under-tested behavior;
- accuracy and usefulness of resulting contracts;
- placement of tests at the owning layer;
- use of broader tests only for distinct boundary evidence;
- regression strength and determinism;
- avoidance of redundant coverage, excessive documentation, and unrelated churn; and
- quality of recorded exclusions and unresolved findings.

### 5. Refine reusable surfaces and repeat

- [ ] Classify each miss as a guidance, skill, template, audit-method, run-configuration, execution, or evaluator problem.
- [ ] Prefer changes to durable skills, guidance, and templates already used by the workflow when the lesson applies broadly.
- [ ] Change per-run configuration only when the lesson concerns scope, priorities, budget, stopping conditions, inherited findings, reports, or validation unique to that execution.
- [ ] Record where every refinement lands and why it belongs there.
- [ ] Do not insert issue-specific expected answers into reusable or per-run instructions.
- [ ] Start each repeat as a new numbered iteration from the latest approved state; do not rewrite completed trial records.
- [ ] Re-evaluate against the unchanged private criteria and compare discovery quality, repair quality, churn, and cost with prior trials.
- [ ] Repeat only while a material process improvement remains plausible.

Completion gate:

The agreed evaluation threshold is met and a subsequent run yields no material new deficiency within its declared scope and budget.

### 6. Test generality

- [ ] Select a consequential Rust area not used to derive or tune the private evaluator.
- [ ] Pre-register expected evaluation criteria independently from the trial workflow.
- [ ] Run the reusable iteration with only neutral run-specific configuration.
- [ ] Evaluate whether findings and repairs satisfy the same quality principles without issue-specific prompting.
- [ ] Refine reusable surfaces only for lessons that generalize beyond the selected area.

Completion gate:

The workflow demonstrates useful discovery and proportionate repairs outside the area used during its design.

### 7. Final engineering review and polish

- [ ] Reveal and review all known evaluation gaps after the trial series is complete.
- [ ] Manually inspect any missed or weakly repaired gaps.
- [ ] Add, revise, consolidate, or remove documentation and tests so final code quality does not depend on the experiment having succeeded.
- [ ] Confirm browser tests retain only integration responsibilities that require generated WASM, real WebTransport, or browser behavior.
- [ ] Record residual risks and intentionally deferred work.
- [ ] Run canonical Rust-service and repository validation required by `DEVELOPMENT.md` and the coordination skill.
- [ ] Update this plan with final evidence and mark it complete.

## Trial Record Requirements

Each trial remains an ordinary immutable numbered iteration under `rust-service/iterations/`.
In addition to the normal iteration records, the outer plan should retain or link a comparison containing:

- trial number and source commit;
- reusable guidance, skill, and template versions used;
- run-specific scope, budget, and stopping conditions;
- independently discovered findings and their dispositions;
- validation results;
- evaluator result recorded after completion;
- effort and churn indicators available from normal records;
- reusable changes proposed for the next trial; and
- whether another trial is justified.

Do not place the private issue-specific evaluator answers in a charter, workstream instruction, or other artifact available to trial agents before that trial completes.

## Validation Strategy

Use focused validation immediately after each implementation change.
At each numbered trial's integration boundary, run the canonical commands in `DEVELOPMENT.md`, the scoped repository policy check, and `pnpm build:fast` when changed files affect the registered pnpm build graph.

For changes limited to this plan or other documentation outside registered package inputs, run:

```bash
cd rust-service
node scripts/check-documentation.mjs
```

Validate skill and template changes with the checks owned by the Rust-service coordination skill.
Do not use a successful browser test as a replacement for focused Rust tests, and do not require browser validation when no changed behavior crosses that boundary.

## Success Criteria

This work is complete when:

- ordinary Rust-service guidance makes contract and localized-regression expectations actionable;
- broadly applicable improvements live in reusable skills and templates used by normal work;
- one reusable, risk-driven quality iteration can be configured without embedding issue-specific answers;
- repeated trials converge without rewarding documentation or test volume;
- an independent area demonstrates that the workflow generalizes;
- known gaps receive a final human-reviewed resolution regardless of trial performance;
- all accepted code and documentation pass proportionate focused and canonical validation; and
- trial records explain what was discovered, changed, excluded, deferred, and learned.