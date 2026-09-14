# Iteration 0012 Retrospective

## What We Expected

Six exclusive, dependency-independent ownership areas would extend iteration
0011's quality audit by documenting every hand-authored named declaration and
member and orienting every important package or grouping folder. Inventories,
compiler checks, local README commands, and full integration validation would
bound the work without product redesign.

## What We Observed

All six workstreams completed and integrated without source conflict. The audit
added declaration documentation throughout the Rust workspace and 17
minimal-driver TypeScript files, including complete `wasmClient.ts` coverage.
Sixteen Cargo package READMEs and two grouping READMEs were added. Existing tests
supported every retained semantic claim, so no product fix was needed. Global
private-item/JSDoc enforcement remains inconclusive; a narrow README/link checker
was retained instead.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- The first delegation used read-only exploration agents, which produced useful
	inventories but no implementation. The assignments were redispatched to
	write-capable agents, as already required by the coordination skill.
- A host reboot interrupted kernel/storage and Fluid-driver work. Git status,
	reports, and worktree identity preserved the partial work; both streams resumed
	without discarding changes. See their Phase 2 reports.
- Shared terminals preempted transport validation, and Fluid build cache success
	initially omitted ignored worktree-local outputs in the driver stream. Exact
	direct generation and consumer execution resolved both issues.
- Integration's first WASM generation inherited an isolated `CARGO_TARGET_DIR`
	from the preceding Rust gate. It failed before consumer execution because the
	script expected the workspace target path. Explicitly clearing Cargo/rustdoc
	environment and rerunning passed.
- Approximate elapsed time and token use are unknown. The user intervened only to
	approve the iteration and request reboot recovery.

## Agentic Development Findings

The six-way decomposition remained effective: direct Git-object review found no
ownership violation or shared source conflict. The uniform documentation
contract prevented each stream from inventing a different definition of done.
Reports retained quantitative inventories and honest exclusions. Integration
validation remained essential for fresh generated outputs and browser behavior.

Recovery after reboot worked because partial changes and report state remained
isolated by worktree. The weakest point was execution isolation: read-only agent
selection and shared terminal state caused avoidable retries, but existing skill
rules already describe the correct behavior.

## Practices to Keep, Change, or Stop

- **Keep:** exclusive paths, common kickoff, concurrent worktrees, quantitative
	inventories, claim-to-test review, and direct Git-object acceptance. Owner:
	coordination workflow.
- **Keep:** public compiler diagnostics plus language-aware inventory for broader
	documentation contracts. Owner: future documentation workstreams.
- **Change:** explicitly clear target and rustdoc environment between canonical
	Rust and generated-consumer gates. Owner: coordinator.
- **Keep:** generate and execute exact ignored consumers in the integration
	checkout. Owner: coordinator.
- **Stop:** treating a read-only exploration result or build-cache success as an
	implementation or consumer result. Owner: coordinator and delegated agents.

## Durable Lessons

Promoted one confirmed lesson: declaration-level documentation completeness
requires language-aware inventories in addition to public compiler diagnostics
and README checks. This generalizes to any mixed-language workspace whose normal
linters cover only public or exported surfaces.

## Open Questions

- Should a future change make public Rust missing-doc checks continuous policy?
- Is a maintainable TypeScript/private-Rust documentation analyzer worth its
	ongoing exclusion and quality cost?
- Should local Markdown anchor validation be added when broken-anchor evidence
	appears?
