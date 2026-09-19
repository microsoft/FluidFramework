# Iteration 0017 Skill Review

Status: complete.

## Evidence Reviewed

Evidence includes the [charter](charter.md), [integration and workstream reports](phase-2/integration.md), [inventory](quality-inventory.md), [retrospective](retrospective.md), integrated tests, and nine run results summarized in [execution evidence](execution-evidence.json).
The runner establishes checkout guards, command order, and `RUSTDOCFLAGS=-D warnings`.
The coordination skill and both instruction templates contain the applied capability-discovery and coordinator-batching clarification.
The coordinator inspected commit objects for ownership, accepted clean merges, and verified full-run JSON and generated, Node.js, and Chromium outcomes.
Integrated runtime-test input is `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`, from kickoff `cc2abb85cefb3a29e9b7d75e62986dff83e75680` and source `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`.

Iteration [0016's review](../0016/skill-review.md) retained precise contracts/local diagnosis, direct delegated-evidence verification, convergence triggers, and deferred product choices without new skills.
This run rechecks those rules: the two repairs support local diagnosis, the duplicate report renews the artifact-verification trigger, and the transport deferrals remain gated rather than becoming implicit scope.

### Verification Matrix

| Requirement or capability | Observed evidence | Assessment |
| --- | --- | --- |
| Scope confirmation | User-approved incremental mode, three owners, two boundaries and at most one repair cluster each | Confirmed; no expansion authorized |
| Generator sequence | `init` followed by `init-quality` generated the real 0017 kickoff in the main checkout | Correct required order; not a disposable fixture |
| Early `validate-quality` | Optional early attempt rejected an empty reviewed table; six real rows now exist | Expected evidence prerequisite, not a validator bug; validator unchanged |
| Worktree ownership | Distinct checkouts/branches, guarded runs, and coordinator inspection of named commit objects and owned paths | Ownership and clean merges accepted |
| Realistic process probe | Three owner-labelled rendezvous results, distinct PIDs, common group, overlapping exact clocks, exit 0 | Coordinator process overlap verified; not delegate access |
| Real overlapping checks | Three task-run intervals overlap; each records its own commands and exits | Coordinator compound scheduling verified; no throughput comparison |
| Actual delegate discovery | Delegate probe lacked `tool_search`; coordinator then imposed file-only execution within user-approved scope | No delegate task invocation; autonomous scheduling unavailable and unverified |
| Cancellation | No task cancellation capability | Not attempted; cancellation isolation unverified |
| Interference recovery | No unexpected exit 130 or foreign result observed | No upstream fix or recovery-path exercise claimed |
| Cache contention | Brief Cargo package-cache waiting reported during attributable checks | Observed contention, not terminal interference |
| True check failure | Recovery fmt exit 1 after passing tests/Clippy; exact layout correction and rerun exit 0 | Failure diagnosed and preserved; not an ambiguous terminal failure |
| Independent review | Supplied static review found no high-confidence test problems and supported transport gaps | Useful static evidence, no independent runtime/browser validation |
| Native gates | Six commands exit 0, 174 tests; runner supplies `RUSTDOCFLAGS=-D warnings` | Native gates passed; no inferred environment dump |
| Full completion | Coordinator accepted `integration-full-1789848676088-f31e277c-8f10-4a4f-b9b3-18a9f439bc33`: JSON exit 0, four exit-0 commands, HEAD `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`, and passing generated/Node.js/Chromium output | Full validation accepted; final record validators pending |
| Partial task output | Full `run_task` returned partial output before the result existed | Durable matching completion evidence was required and later accepted |
| Report structure | Coordinator removed the duplicate stale transport draft in integration | Final structure validation complements accepted code/evidence review |
| Skill/template refinement | Actual delegate discovery and coordinator parallel file-edit/check fallback present in all three surfaces | Applied clarification of existing rules; final documentation checks pending |

## Candidate Skills or Changes

| Candidate | Trigger and reusable procedure | Expected benefit |
| --- | --- | --- |
| Delegate capability discovery | Coordinator task access existed while delegate discovery did not. Verify discovery, including required `tool_search`, and actual assigned `run_task` invocation in the delegate before promising autonomous loops. | Avoid unsupported execution assumptions. |
| Coordinator edit/check batches | Delegates could read/edit but not run checks. Keep file work parallel, return required checks, pause further edits, run coordinator tasks immediately, and return attributable results before redispatch. | Preserve bounded independence and immediate validation without shared-terminal fallback. |
| Quality initialization/validation timing | Empty kickoff table failed optional quality validation. Initialize normal records then inventory; validate substantive quality rows when populated. | Avoid treating expected closeout prerequisites as validator defects. |
| Durable completion and report acceptance | Partial output and duplicated stale report text risk false success claims. Check each fresh result, relevant log outcomes, named code/commit paths, and report structure. | Reject stale, missing, contradictory, or incomplete evidence. |
| Diagnostic fixture examples | Routing required live destinations; terminal barriers required announced membership; transport requires callback arguments and physical release. | Make existing owning-decision guidance concrete without adding redundant policy. |
| Autonomous scheduling/cancellation | Missing tools prevented direct delegate invocation and cancellation testing. Revisit only after capability availability. | Bound future claims to an attributable disposable probe. |

## Decisions

- Accepted as already-applied refinement: actual delegate discovery and the coordinator file-edit/check-batch fallback, in the existing coordination skill and both instruction templates.
- Accepted with no new change: `init` then `init-quality`, substantive closeout quality validation, fresh per-child completion evidence, and direct code/report verification; current skills already require these.
- Accepted with no new change: retain exact contracts, practical owner-local diagnosis, and explicit convergence/revisit triggers from 0016. Concrete fixture examples belong in these reports unless repetition demonstrates a reusable guidance gap.
- Rejected: a validator fix for the empty kickoff table, a new skill, claims of an upstream terminal fix, performance/throughput improvement, or browser release from native success.
- Deferred: autonomous delegate scheduling, cancellation isolation, and the two transport evidence proposals until their tools or exact ownership approvals exist.

Decision-record assessment: no new product semantics or conformance obligation changed.
The refinement spells out a narrower route already allowed by task-first validation and the existing fallback; it preserves immediate validation, ownership, and scope authority.
No new shared-policy choice or decision record is needed for this clarification.

## Applied Changes

The coordinator applied the refinement to these existing surfaces:

- [Coordination skill](../../../../.github/skills/rust-service-coordination/SKILL.md#terminal-coordination): verify actual delegate discovery/invocation and use parallel file batches followed immediately by coordinator checks when delegate task access is absent.
- [Workstream instruction template](../../../../.github/skills/rust-service-coordination/assets/workstream-instructions.template.md#terminal-access): same capability check and pause/check/redispatch handoff.
- [Next-workstream instruction template](../../../../.github/skills/rust-service-coordination/assets/next-workstream-instructions.template.md#deliverables-and-validation): carry that requirement into any later authorized work.

Direct file reads confirm all three surfaces contain the refinement and preserve their surrounding ownership rules.
The observed coordinator probe/check results support the fallback, not autonomous delegate execution.
The [known issue](../../../KNOWN_ISSUES.md#vs-code-terminal-tools-can-interfere-across-subagents) records coordinator task-batched iteration verification while keeping the underlying issue open.
The [learning index](../../../LEARNINGS.md#agentic-development) retains the capability mismatch and observed fallback outcome, not a duplicate procedure.
No validator change or new skill is needed.
Phase 2, quality, documentation, scoped policy, and 186 local-link/anchor checks passed; complete-record validation gates the Phase 3 commit.

## Next Review Triggers

- Delegate tool discovery or `run_task` becomes available: verify actual invocation before claiming autonomous scheduling.
- A safe task cancellation capability becomes available: use an approved disposable owned probe, not a real check or unrelated terminal.
- A compound task produces mixed identities, foreign results, unexplained exit 130, missing completion artifacts, or duplicate running invocations.
- Cache contention becomes material under a defined comparable workload; measure before proposing scheduling or throughput changes.
- A final report again contains stale duplicate structure, or a validator pass is used in place of direct code/evidence review.
- An adequate disposition lacks a test that discriminates the exact owning decision despite current guidance.
- A transport approval or concrete lifecycle change activates the callback/physical-release deferrals, or another recorded inventory trigger occurs.

No next iteration is authorized; `nextWorkstreams` remains empty and the approved bounded audit stops with these explicit revisit triggers.
