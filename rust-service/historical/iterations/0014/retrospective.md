# Iteration 0014 Retrospective

## What We Expected

We expected a neutral, risk-ranked audit of all 14 Rust packages to improve on
iteration `0013` without issue-specific prompts, declaration enumeration, or
coverage-driven churn. Fourteen independent crate workstreams shared one
kickoff, owned non-overlapping paths, accepted no-change outcomes, and stopped
after at most two repair clusters. We expected prior evidence plus direct
consumer, contract, implementation, and test comparison to support convergence.

## What We Observed

The run reviewed 47 boundaries and reconciled 18 repairs across 11 workstreams,
24 adequate dispositions, and five deferrals. `sea-compression` and
`sea-counter` were accepted without implementation or test changes. Four repair
groups corrected production defects; the remaining repairs strengthened focused
tests or contracts without changing behavior.

Canonical Rust validation, `./test.sh` including generated and Chromium checks,
policy, and `pnpm build:fast` ultimately passed. Negative evidence remained for
five boundaries that need a fault seam, shared resolution contract, API or
architecture authority, browser fixture, or handshake fixture. Independent
post-boundary evaluation also found that topical evidence could be mistaken for
exact owning-decision evidence, so convergence remains inconclusive.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Concurrent command runners repeatedly rebound to sibling worktrees or
	interrupted cold Cargo and WASM builds. Absolute branch, path, HEAD, result,
	and lockfile guards rejected foreign or incomplete output, but retries affected
	most workstreams and cost substantial validation time. Representative evidence
	appears in the notable-event tables of the [workstream reports](phase-2/) and
	the [integration report](phase-2/integration.md#cross-workstream-findings).
- The first `pnpm build:fast` integration run failed only root Biome formatting
	for the new validator line and generated manifest. Changing the generator to
	tab-indented JSON and formatting both files resolved the issue; the cached
	rerun passed 142 of 142 tasks in 72.162 seconds.
- The standalone quality-inventory script failed policy because it lacked the
	required license header. Consolidating its commands into the already licensed
	coordination script removed duplicate ownership and passed policy. Disposable
	tests retained initialization, incomplete rejection, complete acceptance, and
	overwrite refusal behavior.
- Integration needed a worktree-local `pnpm install --frozen-lockfile` so pnpm
	links resolved in the isolated checkout. It changed neither root nor Rust
	lockfiles.

## Agentic Development Findings

The crate partition produced conflict-free source integration and clear
ownership. Agents generally formed bounded findings, used focused tests after
edits, distinguished conformance from implementation evidence, and stopped
without manufacturing changes. Reports and the inventory made handoff and
reconciliation practical; no mid-workstream shared semantic decision was needed.

The weakness was evidence discrimination, not topic selection. Some adequate
reasoning named relevant tests without asking which exact owning decision would
make them fail or whether another component could mask the regression. Command
execution was also insufficiently isolated: guards protected acceptance, but
shared runners still changed checkout context or terminated cold builds. The
user supplied the approved iteration `0015` refinement and explicit deferrals;
no issue-specific hidden finding was placed in trial-visible records.

## Practices to Keep, Change, or Stop

- **Keep:** neutral prompts, non-overlapping ownership, two-cluster budgets,
	accepted no-change results, direct Git-object review, exact generated-consumer
	execution, and canonical integration gates. Owners: coordinator and each
	workstream.
- **Change:** require every adequate disposition to identify the exact owning
	decision and nearest test that fails when only it regresses. Owners: quality
	skill, coordination integration, reports, and Phase 3 review.
- **Change:** use literal absolute `git -C` guards and isolated Cargo target and
	command-execution channels for concurrent worktrees. Owner: coordinator and
	execution infrastructure.
- **Stop:** accepting topical passing coverage, zero-selected tests, interrupted
	commands, or sibling-worktree output as evidence. Owner: every reviewer.

## Durable Lessons

One lesson was promoted to [LEARNINGS.md](../../LEARNINGS.md#correctness-and-testing):
topical conformance or integration coverage is insufficient when another
component can satisfy the assertion while the owning implementation decision is
broken. It generalizes across storage backends, decorators, transports, and
workloads. The execution-isolation incidents reinforce existing checkout and
cleanup guidance, so no additional learning bullet was added.

## Open Questions

- Which inherited adequate dispositions survive exact owning-decision review in
	iteration `0015`?
- Can execution infrastructure provide one isolated command channel and Cargo
	target per workstream without sacrificing useful cache reuse?
- When will deterministic browser, stalled-handshake, partial-I/O, or power-loss
	fixtures make the retained product deferrals actionable?
