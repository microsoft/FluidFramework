# Iteration 0002: durable-snapshots Instructions

Status: planned
Branch: `rust-service-iteration-0002-durable-snapshots`
Iteration source commit: `57b0028ff9061087b522c8dd652ca9b8b2179e50`
Owner: GitHub Copilot durable recovery agent
Report: `rust-service/iterations/0002/phase-2/durable-snapshots.md`

## Assignment

Extend the durable-log spike with crash-tested framing discrimination and snapshot publication/recovery coordinated with the stream. Hypothesis: duplicated framing evidence plus an atomically published, synced snapshot record can distinguish incomplete tails from corruption and keep every acknowledged snapshot recoverable. Retention, optimization, and multi-process claims are out of scope.

## Ownership

Writable: `rust-service/crates/spikes/durable-log/` and `rust-service/iterations/0002/phase-2/durable-snapshots.md`. Read-only: core, shared conformance, workspace files, other implementations, decisions, and reports. Consume reference/model additions when available. Do not change shared contracts or introduce undocumented recovery heuristics.

## Expected Evidence

Deliver deterministic fault injection at record/snapshot write, sync, rename/publication, and reopen boundaries; framing discrimination; snapshot lineage/non-regression; acknowledged-snapshot recovery and replay; exact sync policy; persisted amplification; recovery timing procedure; source/dependency/environment metadata. A crash point that makes an acknowledged snapshot unusable is sufficient falsification.

## Validation

- Print the absolute worktree and `git branch --show-current` with retained results.
- `cargo fmt --all -- --check`
- `cargo test -p snapshotted-stream-durable-log-spike --all-features`
- `cargo clippy -p snapshotted-stream-durable-log-spike --all-targets --all-features -- -D warnings`
- Validate manifest changes in an exact disposable copy and run `git diff --exit-code -- rust-service/Cargo.lock` in the assigned worktree.
- Integration: applicable shared conformance and `cargo test --workspace --all-targets --all-features`.

## Escalation and Stopping Conditions

Escalate shared contract needs, snapshot/stream atomicity that cannot be expressed locally, or framing that cannot distinguish tested corruption. Stop before retention, multiple-process coordination, or unverified durability claims. A deterministic failing crash trace and precise requirement are useful outcomes.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
