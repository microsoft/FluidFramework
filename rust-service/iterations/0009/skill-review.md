# Iteration 0009 Skill Review

## Evidence Reviewed

Reviewed the [workstream events](phase-2/full-driver-single-writer-capacity.md#notable-events), [integration findings](phase-2/integration.md#cross-workstream-findings), and [retrospective](retrospective.md). The applicable coordination skill is the version at kickoff `0f3d24a8d363e03463b4e6ab9046e10c75cdfe7f`.

## Candidate Skills or Changes

- Benchmark writes inside the repository: define a narrow output-path exclusion in source provenance before measurement, then prove source and lockfile changes remain visible. This prevents the measurement from invalidating its own clean-source label.
- Copied worktree with ignored generated outputs: directly inspect required declarations/package links and invalidate stale incremental state before accepting a fast successful build. This shortens diagnosis of false-ready worktrees.
- Logical-operation capacity under batching: use append-only or independently counted state, issue a burst without per-operation waits, and require final observer convergence. This prevents latency or message-count evidence from being mislabeled as application capacity.

## Decisions

- Output provenance: accepted as benchmark instruction/checklist guidance; one occurrence does not justify changing the general coordination skill.
- Copied-worktree diagnostics: accepted as local guidance and already covered by the durable generated-artifact lesson in `LEARNINGS.md`; no duplicate skill rule.
- Counted capacity workload: accepted as a durable performance lesson in `LEARNINGS.md`, not a coordination procedure.

## Applied Changes

None. Existing coordination validation correctly enforced completed reports, integration state, and explicit unresolved evidence.

## Next Review Triggers

- A second benchmark loses valid clean-source evidence because output location was not planned.
- Multiple copied worktrees report successful builds while required ignored outputs are absent.
- A future capacity study passes final state while requested logical operation count cannot be independently verified.
- Scoped `--no-deps` lint repeatedly hides regressions in dependencies changed by the same workstream.
