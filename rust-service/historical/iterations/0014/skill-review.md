# Iteration 0014 Skill Review

## Evidence Reviewed

Reviewed all 14 [workstream reports](phase-2/), their instructions, the
[integration report](phase-2/integration.md), 47-row
[quality inventory](quality-inventory.md), [Phase 3 contract review](phase-3-report.md#contract-and-test-quality),
and [retrospective](retrospective.md). Reusable surfaces were compared with the
Phase 2 integration commit `77bc21dc22b2426b728aa765e693c227f3df843e`.
Prior multi-worktree guard, generated-artifact, cleanup, and test-layer guidance
was reconsidered against this run's repeated command-routing incidents and
post-boundary owning-decision finding.

## Candidate Skills or Changes

- **Exact owning-decision discrimination:** Triggered when a workstream proposes
	`already adequate`. Name the implementation decision and nearest test that
	fails if only it regresses, then ask whether another component can satisfy the
	assertion. This prevents topical broad coverage from masking a focused gap.
- **Inventory command consolidation:** Triggered by duplicate scripts and a
	policy-header failure. Put initialization and validation in the licensed
	coordination record script while the quality skill owns usage semantics. This
	gives iteration records one command surface and policy owner.
- **Absolute and isolated execution:** Triggered by sibling-worktree rebinding
	and interrupted cold builds. Use literal absolute `git -C` guards and isolated
	target/execution channels, retaining explicit branch, HEAD, status, command,
	and result provenance.
- **Shared semantic decision record:** Considered for the retained product
	deferrals. No decision is currently supported because each boundary first
	needs a fixture, fault seam, API authorization, or selected recovery contract.

## Decisions

- **Accepted:** exact discrimination belongs in the quality skill, coordination
	Phase 2 integration rule, workstream report template, integration report
	template, Phase 3 template, and the one general LEARNINGS entry.
- **Accepted:** inventory command consolidation belongs in the coordination
	script, with command references in the quality skill. The standalone script
	is deleted.
- **Accepted recommendation:** absolute `git -C` and isolated target/execution
	channels. Existing coordination guidance already requires provenance guards;
	this run strengthens the operational recommendation without another template
	change.
- **Rejected for this iteration:** a shared semantic decision record. The five
	retained product boundaries remain evidence-gated rather than decision-ready.
- **Deferred:** further execution-runner policy changes until iteration `0015`
	shows whether dedicated channels remove rebinding and interruption costs.

## Applied Changes

- The quality skill now requires exact owning-decision/test mapping during audit,
	adequate disposition, and integration review.
- The coordination skill applies the same rule at Phase 2 integration.
- Workstream, integration, and Phase 3 templates prompt the same challenge at
	reporting and synthesis boundaries.
- Quality inventory initialization and validation now use the licensed
	`iteration-records.mjs`; the standalone quality script was deleted after the
	policy header failure.
- The existing LEARNINGS change contains the one promoted general lesson.
- Five iteration `0015` instructions apply the stricter rule to non-overlapping
	`core-session`, `storage`, `decorators`, `transport`, and `workloads` scopes,
	with at most two repair clusters each.

Disposable command validation covered initialization, incomplete-record
rejection, complete-record acceptance, and overwrite refusal. Integration also
passed Node syntax, record checks, documentation, policy, Biome after formatting,
and the cached 142-of-142 repository build.

## Next Review Triggers

- An iteration `0015` adequate disposition still lacks an exact discriminating
	test or can be masked by another component.
- Dedicated execution channels still bind to sibling worktrees, interrupt cold
	builds, or make source and artifact provenance ambiguous.
- Inventory commands diverge from general record behavior or lose the four
	tested create/reject/accept/refuse properties.
- A retained browser, handshake, partial-I/O, ambiguous-append, stale-crash-point,
	or power-loss boundary gains deterministic evidence or decision authority.
