# Iteration 0003 Skill Review

## Evidence Reviewed

Reviewed all three workstream reports, [Phase 2 integration](phase-2/integration.md), and the [retrospective](retrospective.md) against the kickoff skill at `d568058d3e6`. Evidence includes one proposal-only dispatch, repeated wrong-checkout command routing, direct conformance finding a codec violation, and conflict-free path integration.

## Candidate Skills or Changes

- **Write-capable agent selection:** implementation dispatches must use an agent capable of editing and executing; read-only exploration agents are limited to audits.
- **Direct conformance matrix:** map each new helper or accepted semantic law to every applicable implementation before Phase 2 completion.
- **Process harness helper:** consider factoring bounded child lifecycle and marker utilities only after iteration `0004` reveals cross-platform requirements.
- **Dependency waves:** record prerequisites for workstreams that share a kickoff but cannot safely invent contracts independently.

## Decisions

Write-capable dispatch and direct conformance are accepted as coordinator practices because each prevented a concrete failure this iteration. Dependency-wave recording is accepted for iteration `0004`. A shared process harness is deferred because Unix, browser, and native HTTP/3 lifecycles may not share enough mechanics.

## Applied Changes

None. The accepted practices are encoded in iteration `0004` instructions first. A shared skill change remains deferred until another iteration confirms stable wording and automation boundaries.

## Next Review Triggers

Review if a write-capable agent still returns proposals without commits, if dependent workstreams diverge on protocol bytes, if direct conformance again finds a late defect, or if native/WASM dependency resolution causes shared lockfile churn across worktrees.
