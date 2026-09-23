# Iteration 0004 Skill Review

## Evidence Reviewed

Reviewed all six workstream reports, [Phase 2 integration](phase-2/integration.md), and the [retrospective](retrospective.md). Repeated evidence included wrong-worktree delegated output, stale generated provenance, uncertainty about whether agents were active, and the need to distinguish code presence, report completion, and integration. The existing coordination skill at the iteration kickoff already required checkout identity and exact-copy validation but provided no bounded observation workflow.

## Candidate Skills or Changes

- **Rust service status reporting:** trigger on progress, status, stall, or integration-state questions. Discover worktrees and the manifest, collect Git/report/process evidence read-only, classify conservatively, and report all workstreams plus integration. This avoids disturbing agents and replacing evidence with terminal-state guesses.
- **Validation isolation automation:** repeated exact-copy and checkout-routing friction supports a future helper, but command requirements differ across native, WASM, browser, and benchmark workstreams.
- **Benchmark schema validation:** the rejected partial matrices support automated cell/repetition checks, but the schema is still benchmark-specific.

## Decisions

The user approved and supplied `rust-service-status-report`; it is accepted because iteration `0004` repeatedly needed this exact read-only workflow. Validation-isolation automation and benchmark schema validation remain deferred until another iteration demonstrates stable cross-workstream inputs. Existing coordination requirements for absolute paths, write-capable implementation agents, direct conformance, and dependency waves remain accepted.

## Applied Changes

Commit `df046182256` adds `.github/skills/rust-service-status-report/SKILL.md` and `scripts/collect-status.mjs`. `node --check` passed. Its compact collector discovered iteration `0004`, all six workstreams, the integration checkout, Phase 2 completion, and integration head `df046182256a`; the checkout remained clean after validation.

## Next Review Triggers

Review the skill if it misclassifies an active process, cannot discover a conventionally named worktree, emits unbounded output, or causes any filesystem/process mutation. Reconsider validation automation if iteration `0005` again loses substantial effort to exact-copy setup or wrong-checkout evidence. Reconsider dependency-wave instructions if the browser or driver workstream invents a prerequisite contract rather than waiting for its accepted handoff.
