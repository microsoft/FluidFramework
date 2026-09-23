# Agentic Development of Sea

This guide describes the development experiment recorded through 2026-09-21.
It connects the [project overview](PROJECT_OVERVIEW.md#ai-assisted-development) to the retained instructions, iteration reports, and [learnings](LEARNINGS.md).
It is an account of observed outcomes, not a controlled comparison with human-only development or a claim of fully autonomous delivery.

## How the Work Was Organized

The project used reusable agent-written skills to coordinate implementation and later quality audits.
A coordinator divided approved work into bounded workstreams, assigned ownership and hypotheses, and integrated the results.
Independent workstreams could use separate Git worktrees; shared semantics and cross-workstream changes required coordination.
Workers returned code, tests, and evidence, not just completion summaries.
Integration checks and a separate synthesis step assessed the combined result, remaining gaps, and whether another iteration was justified.

The reusable procedures remain current tools outside this historical folder:

- [Coordination](../../.github/skills/rust-service-coordination/SKILL.md): choose lightweight work or a full iteration, assign ownership, validate, integrate, and close out.
- [Quality iteration](../../.github/skills/rust-service-quality-iteration/SKILL.md): select consequential contracts, challenge regression evidence, record dispositions, and apply stopping criteria.
- [Simplification iteration](../../.github/skills/rust-service-simplification-iteration/SKILL.md): find and remove accidental complexity while preserving contracts, tests, and supported behavior.
- [Status reporting](../../.github/skills/rust-service-status-report/SKILL.md): inspect progress without interfering with workstreams.

These links show the current skills, which evolved during the experiment.
Each iteration's recorded source and kickoff revisions identify the instructions available at that time.
The [original plan](PLAN.md) and [foundation report](foundation-report.md) describe the initial setup, not prerequisites for contributing now.
The [proportional-workflow decision](decisions/0010-proportional-iteration-workflow.md) explains why routine sequential work does not need numbered iterations.

## Representative Outcomes

Read these reports in order for the quality-audit part of the experiment.
Inventory counts describe each run's selected boundaries; they are not independent defect counts and must not be summed across repeated audits.

| Record | Observed result | What it shows |
| --- | --- | --- |
| [Iteration 0014](iterations/0014/phase-3-report.md) | 47 reviewed boundaries; 18 repaired dispositions, including four production defect groups; later review challenged some adequate assessments. | Agents found useful defects, but relevant passing tests were sometimes mistaken for evidence about the exact owning decision. |
| [Iteration 0015](iterations/0015/phase-3-report.md) | 48 inventory rows; nine repaired regression-evidence gaps, 33 adequate, six deferred; no production behavior change. | A stricter audit found gaps in earlier coverage assessments. Contract traceability and local diagnosis became explicit acceptance criteria. |
| [Iteration 0016 skill review](iterations/0016/skill-review.md) | Challenging 33 previously adequate rows found one focused repair; the existing refined rule worked without another skill change. | Refinement can improve the process, but another run should require a concrete hypothesis rather than a repair quota. |
| [Iteration 0017](iterations/0017/phase-3-report.md) | Six selected boundaries; two test-only repairs, two adequate results, and two partial or deferred transport findings. | A bounded audit can finish usefully without resolving every gap or changing runtime code. |

The repairs are not merely more tests: the reports name the decision that could regress and the observation intended to detect it.
For example, iteration 0017 distinguished server capacity recovery from invocation of the admission cleanup callback, and logical browser shutdown from physical connection release.
Those distinctions prevented stronger claims than the assertions supported.
Later focused regressions addressed the callback and browser-release gaps; the current [server tests](../crates/sea-webtransport-server/src/server.rs) and [browser lifecycle guide](../tests/webtransport-browser/README.md#physical-connection-release) describe that evidence.
The completed iteration reports retain their original dispositions rather than retrospectively claiming those later repairs.

## Human Involvement and Evaluation

People selected goals, approved scope, challenged conclusions, and decided when to refine or stop the audits.
According to the project author, the coordinator knew a private evaluation target: a bug fix had exposed missing coverage and a poorly placed regression test.
Audit workers received general quality guidance rather than that target.
This was not deliberate defect seeding.
The objective was partly achieved; further runs eventually stopped producing material improvement within the chosen scope.

The [overview's workflow diagram](PROJECT_OVERVIEW.md#ai-assisted-development) summarizes that author account.
The retained [0016 skill review](iterations/0016/skill-review.md) and [0017 convergence assessment](iterations/0017/phase-3-report.md#convergence-assessment) support the method and its limits, but do not reconstruct the complete private-evaluation chronology or scoring.
Stopping a scoped audit is not evidence that the code is defect-free.

## Friction and Failed Assumptions

The [0017 retrospective](iterations/0017/retrospective.md) records unavailable delegate tools, build-cache contention, a real formatting failure, and incomplete task output.
Coordinator access to a task tool did not imply delegate access.
The coordinator therefore accepted parallel file-edit batches and ran attributable validation itself; autonomous delegate scheduling and cancellation remained unverified.
Separate worktrees did not isolate shared terminal execution, as described in the [execution isolation investigation](EXECUTION_ISOLATION_INVESTIGATION.md).

Reports were also fallible artifacts.
The records include vague delegated evidence, stale assessments, and duplicate report templates.
Direct inspection of commits, test assertions, and completed validation results was necessary; a plausible narrative was not sufficient.
The resulting safeguards live in the current skills and validators, rather than depending on readers remembering these incidents.

## What Effectiveness Means Here

The records support concrete claims: specified defects were repaired, selected coverage gaps were exposed, some existing evidence was adequate, and certain findings remained unresolved.
They also show changes to the audit criteria and cases where those changes produced better-localized evidence.
Failures, no-change results, and scope limits are retained alongside successes.

The records do not establish a productivity advantage over human-only work, a general defect-discovery rate, exhaustive coverage, or a cost benefit.
There is no controlled sequential baseline or complete accounting of human effort, model usage, and token cost.
Recorded command durations measure validation runs, not total development effort.
Use the reports to inspect the reasoning and evidence, and the [current development guide](../DEVELOPMENT.md) to work on Sea now.