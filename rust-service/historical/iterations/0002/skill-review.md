# Iteration 0002 Skill Review

## Evidence Reviewed

Reviewed all four workstream notable-event tables, [Phase 2 integration](phase-2/integration.md), and the [retrospective](retrospective.md) against the coordination skill at kickoff `d04c7aa44eb`. Every workstream encountered or guarded against wrong-checkout command routing; one encountered lockfile package-entry churn; integration required direct downstream conformance adaptation.

## Candidate Skills or Changes

- **Retain checkout-marked validation:** trigger whenever multiple worktrees exist; print absolute checkout and branch, isolate target directories, and reject mismatched output. All four reports provide supporting evidence.
- **Retain lockfile-safe dependency validation:** trigger on any crate manifest edit outside lockfile ownership; resolve in an exact disposable copy and compare the assigned lockfile immediately. The authoritative and network reports support this.
- **Candidate integration conformance matrix:** when one concurrent workstream expands shared conformance, identify every applicable accepted implementation and invoke the new helper directly during integration. This exposed the durable regression classification defect despite a passing specialized suite.

## Decisions

The first two procedures remain accepted from iteration `0001`; iteration `0002` confirms rather than changes them. The integration conformance matrix is deferred as a skill change for one iteration: the coordinator will require it in iteration `0003` instructions and integration evidence, then decide whether the command shape is stable enough to automate. No candidate is rejected.

## Applied Changes

None. The current skill already requires concurrent dispatch, actual provenance, checkout-marked evidence, and lockfile safety. Iteration `0002` applies those rules and records the deferred integration-matrix candidate without changing the shared workflow.

## Next Review Triggers

Review after iteration `0003` if direct integration conformance again finds a defect, if checkout markers fail to prevent misattribution, if process tests contend for ports or filesystem state across parallel worktrees, or if a shared lockfile changes despite disposable-copy validation. Promote the conformance matrix only with a repeatable implementation-to-law mapping.
