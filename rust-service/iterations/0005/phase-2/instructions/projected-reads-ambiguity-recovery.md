# Iteration 0005: projected-reads-ambiguity-recovery Instructions

Status: planned
Branch: `rust-service-iteration-0005-projected-reads-ambiguity-recovery`
Iteration source commit: `2de3d94f89ecff3e340eb1d580d628d5d951681b`
Owner: assigned iteration `0005` implementation agent
Report: `rust-service/iterations/0005/phase-2/projected-reads-ambiguity-recovery.md`

## Assignment

Implement [Decision 0007](../../../../decisions/0007-projected-reads-and-ambiguity-recovery.md). Hypothesis: the sequencer can project accepted operations and resolve one stable ambiguous submission through versioned FSP4 without changing kernel traits or introducing hidden retry. Disprove first with a mixed session/operation page whose opaque resume skips or duplicates an operation, or a disconnect-after-commit trace that appends twice or cannot resolve while the service remains live.

## Ownership

Writable: `rust-service/crates/fluid-sequencer`, `crates/protocol`, `crates/service`, focused `crates/client` adaptations, applicable tests/examples, and this report. Read-only: core traits, storage implementations, wrappers, benchmark implementation, prior decisions/reports, root `Cargo.toml`, and `Cargo.lock`. This workstream owns the first shared FSP4 handoff. Do not expose position ordering, decode FSQ2 in clients, add automatic retry, or weaken fencing.

## Expected Evidence

Deliver projected operation types and bounded pagination, compatibility behavior for the versioned protocol, explicit recovery request/results, and lifecycle events. Test mixed and administrative-only pages, exact resume, malformed/foreign cursors, accepted/duplicate submissions, disconnect before/after commit, lost resolution response, repeated resolution, service restart, wrong ownership, and no duplicate canonical append. Record request/response sizes and bounded page behavior; performance optimization is not required.

## Validation

Print absolute checkout, branch, and HEAD before checks. Run `cargo fmt --all -- --check`; focused tests and strict Clippy for `fluid-sequencer`, protocol, service, and client; service process traces; and applicable conformance using an isolated `CARGO_TARGET_DIR`. If dependency resolution needs root changes, validate in one exact disposable copy and immediately prove assigned `Cargo.toml`/`Cargo.lock` unchanged. Finish with `git diff --check`, a clean status, and exact command outcomes in the report.

## Escalation and Stopping Conditions

Stop and preserve the smallest counterexample if projection needs kernel payload knowledge, finite reads cannot advance across filtered spans, recovery needs hidden retry or non-idempotent append, cross-writer authorization is unclear, or existing FSP4 consumers cannot retain compatible behavior. A precise protocol proposal plus failing test is useful partial evidence; do not select shared semantics unilaterally.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
