# Iteration 0005 Skill Review

## Evidence Reviewed

Reviewed all four workstream notable-event tables, [Phase 2 integration](phase-2/integration.md), and the [retrospective](retrospective.md). Repeated evidence included wrong-worktree command summaries, stale Cargo targets, stale generated WASM, missing generated declarations, and a consumer hypothesis blocked by an untested server-concurrency prerequisite. The coordination skill already requires checkout identity, dependency waves, focused validation, and exact-copy checks.

## Candidate Skills or Changes

- **Validation-isolation helper:** trigger for sibling-worktree Cargo or generated-WASM validation; allocate a unique target, print identity, execute the artifact, and verify protected files. This could reduce repeated target and provenance mistakes.
- **Prerequisite-capability probe:** trigger when a dependent workstream requires concurrency, transport, or recovery behavior not yet demonstrated; run the smallest end-to-end check before consumer implementation and stop on failure.
- **Generated-declaration readiness check:** trigger for a newly registered TypeScript consumer; verify dependency declaration entrypoints exist and force the owning build when metadata is stale.

## Decisions

All three candidates are deferred as new skills. Their value is supported, but their command surfaces differ across Cargo, WASM, Chromium, and Fluid builds. The procedures are accepted in the iteration `0006` instructions where concrete inputs are known. Promote automation only after another iteration demonstrates a stable reusable interface.

## Applied Changes

None. Existing `rust-service-coordination` and `rust-service-status-report` skills remain unchanged.

## Next Review Triggers

Reconsider a validation helper if iteration `0006` again reuses a sibling target, accepts stale generated output, or loses requested test counts. Reconsider a prerequisite-probe skill if another consumer begins before its required runtime behavior is demonstrated. Reconsider TypeScript readiness automation if forced dependency declaration builds recur outside this package.
