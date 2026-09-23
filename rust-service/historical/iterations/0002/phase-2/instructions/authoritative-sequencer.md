# Iteration 0002: authoritative-sequencer Instructions

Status: planned
Branch: `rust-service-iteration-0002-authoritative-sequencer`
Iteration source commit: `57b0028ff9061087b522c8dd652ca9b8b2179e50`
Owner: GitHub Copilot authoritative Fluid sequencer agent
Report: `rust-service/iterations/0002/phase-2/authoritative-sequencer.md`

## Assignment

Replace the projection-only spike with a valid-only authoritative Fluid submission service. Hypothesis: one explicitly fenced sequencer plus submission identity and replay can reject invalid operations before storage and resolve ambiguous appends without conditional append. Stale clients reconnect under a new session and regenerate submissions.

## Ownership

Writable: `rust-service/crates/fluid-sequencer/` and `rust-service/iterations/0002/phase-2/authoritative-sequencer.md`. Read-only: core, stores, conformance, workspace files, decisions, and reports. Use codec tokens supplied by integration. Do not add conditional append, deduplication, or session semantics to the kernel.

## Expected Evidence

Deliver tests for valid-only storage, stale-reference rejection before append, writer gap/duplicate rejection, reconnect/new-session behavior, regenerated resubmission, fencing loss, failover replay, ambiguous committed/not-committed outcomes, and submission deduplication. State exactly when clients receive protocol acceptance versus storage ambiguity and compare with cited Deli/PendingStateManager precedents.

## Validation

- Print the absolute worktree and `git branch --show-current` with retained results.
- `cargo fmt --all -- --check`
- `cargo test -p fluid-sequencer --all-features`
- `cargo clippy -p fluid-sequencer --all-targets --all-features -- -D warnings`
- `git diff --exit-code -- rust-service/Cargo.lock`
- Integration: `cargo test --workspace --all-targets --all-features`.

## Escalation and Stopping Conditions

Escalate any trace where fencing permits two accepted successors, ambiguous recovery loses or duplicates acceptance, or a conditional append primitive is irreducible. Stop before changing the kernel. A minimized trace and exact proposed capability are useful outcomes.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
