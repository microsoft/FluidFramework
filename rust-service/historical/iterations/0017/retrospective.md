# Iteration 0017 Retrospective

Status: complete.

## What We Expected

The user confirmed incremental scope: signals, transport lifecycle, and recovery, two ranked boundaries per workstream and at most one repair cluster each.
Independent worktrees would support parallel audits, with guarded task checks and direct delegate task access verified before autonomous edit/test loops.
The charter required exact contracts and tests that distinguish owning decisions, not a minimum repair count.

## What We Observed

Six boundaries produced two test-only repairs, two adequate no-change results, and two partial/deferred transport assessments.
The 42-line signals matrix and 75-line recovery barrier test reuse existing contracts and fixtures; no runtime edits were needed.
Independent static review found no high-confidence problems in the tests and supported the transport evidence gaps, without providing runtime or browser proof.
Native integration passed six gates and 174 tests.
The coordinator accepted full run `integration-full-1789848676088-f31e277c-8f10-4a4f-b9b3-18a9f439bc33`: JSON exit 0, all four commands exit 0, and HEAD `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`.
Output inspection confirmed `./test.sh` generated consumers, Node.js tests, and Chromium tests passed.
Commit-object ownership and clean merges were inspected; Phase 2 and quality validators passed before the acceptance commit.

Delegate `tool_search` was unavailable, so no delegate invoked a task.
The coordinator ran a three-process rendezvous and genuinely overlapping real checks, then reran recovery after a formatting correction.
No unexpected terminal exit 130 or foreign result was observed.
Task cancellation was unavailable and not attempted; no cancellation-isolation or upstream terminal-fix claim follows.

## Costly Issues and Dead Ends

The three workstream notable-event tables and [integration report](phase-2/integration.md) were reviewed.
Elapsed audit effort and cost are unknown; runner intervals below are not agent timings.

| Trigger and approach | Evidence and impact | Resolution or prevention |
| --- | --- | --- |
| Optional early quality validation on the initialized empty table | Failed for absence of a reviewed data row; no validator defect. A temporary explicitly unreviewed row was later replaced by six real rows. | Keep `init` then `init-quality`; reserve quality validation for populated review/closeout records. No validator change. |
| Delegate task-access probe | Actual discovery lacked `tool_search`; coordinator access did not establish delegate access. | The coordinator imposed file-only batches with immediate task checks after the missing-tool probe; the user had approved the audit scope. Verify actual delegate discovery and invocation before promising autonomy. |
| Overlapping Cargo checks | Brief package-cache contention observed; check results retained separate identities and exits. | Distinguish cache serialization from terminal interference; no throughput baseline or optimization claim. |
| Recovery formatting | First run: 33 tests and Clippy passed, fmt failed on one observer/head chain. | Coordinator applied exact rustfmt layout; same three checks passed on rerun. Preserve both attempts. |
| Stronger admission claim than assertions support | Zero default reconnect grace and cleanup counts prove neither service callback invocation nor the `false` argument. | Defer a recording-service assertion; do not count test names or passing capacity checks as callback-policy proof. |
| Browser logical lifecycle used as release evidence | Factory opens, membership close, or server shutdown can succeed with broken client physical close. | Keep two independent physical-release cases as an approval-dependent proposal; no new production API. |
| Duplicate stale transport draft | An appended duplicate obscured the current report. | Coordinator removed it in integration; structure validation complements direct code/evidence review. |
| Partial task output before final completion | Full `run_task` returned partial output before its result existed. | Coordinator accepted completion only after checking the matching durable `result.json`, command exits, HEAD, and consumer outcomes. |

Exact run IDs, command clocks, exits, and raw-log paths are in [execution evidence](execution-evidence.json).
Observed runner durations: signals 15.168 s, transport 83.026 s, recovery 19.816 s then 2.295 s, native 151.998 s, full 600.875 s.
The root build accounted for 513.796 s of the full run; these are validation timings, not product performance measurements.
The three probes finished at `1789847673888` Unix ms; their start/finish intervals demonstrate rendezvous overlap only.
No sequential comparison, agent throughput, model version, token cost, or unrecorded timing is inferred.

## Agentic Development Findings

The two-boundary/one-cluster instruction budget supported independent ownership and useful no-change results.
Signals' live delivery controls and recovery's announced membership made prohibited side effects observable at the owning layer.
Transport correctly stopped at evidence limits instead of broadening fixture ownership or inferring physical release from logical success.
The user approved the bounded scope; after the delegate lacked `tool_search`, the coordinator added the file-only execution restriction and owned task checks, the format correction, and integration acceptance.
This preserved parallel file work, but autonomous delegate scheduling remains unverified.
Reports remain claims to verify: named object/path checks, direct test inspection, independent review, and fresh result artifacts are complementary.
No new contract text was necessary because existing promises already cover both repairs; no redundant conformance or browser assertion was added.

## Practices to Keep, Change, or Stop

- Keep, coordinator: actual checkout guards, fresh per-child evidence, compound overlap checks, ownership restrictions, and failed-attempt retention.
- Clarify, coordinator: discover tools inside the actual delegate; when only the coordinator has task access, validate each returned file-edit batch before further edits. This refinement is already present in the skill and two templates.
- Keep, reviewers: challenge the exact owning decision and the fixture state that makes its forbidden side effect visible; do not rely on test names, counters, or remote conformance alone.
- Stop, coordinator: treating the optional empty-table validation failure as a defect, partial output as success, or a no-change bounded audit as a reason to invent repairs.
- Defer, coordinator: cancellation/autonomous scheduling experiments until the capability exists; use only disposable owned probes and obtain any required scope approval.

## Durable Lessons

The [learning index](../../LEARNINGS.md#agentic-development) now records the observed mismatch between coordinator and delegate capabilities and the verified coordinator-batched fallback.
The procedure remains in the [skill review's applied surfaces](skill-review.md#applied-changes), without duplicating instructions in the index.
Live negative-delivery controls, announced membership before terminal-error checks, and callback/physical-release discrimination are concrete examples of the existing quality skill's owning-decision rule; no new skill is needed.
Durable per-run completion evidence and direct report verification are already required, not new policy proposals.

## Open Questions

Phase 2 acceptance is committed as `4a66ed5a93b`; this retrospective belongs to the separately validated Phase 3 commit.
A future authorized transport batch could test the no-grace callback and independent browser release paths; no such batch or next iteration is authorized now.
Autonomous delegate task invocation and safe cancellation remain unverified until their tools are available.
The applied refinement clarifies existing policy; no new shared-policy choice or decision record is needed.
Stop the user-approved bounded audit with `nextWorkstreams` empty; no push is authorized.
