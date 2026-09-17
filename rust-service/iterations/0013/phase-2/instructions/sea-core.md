# Iteration 0013: sea-core Instructions

Status: active
Branch: `rust-service-iteration-0013-sea-core`
Iteration source commit: `52ad0aa3b4b28498e609d3fe41d9eabcf5f23bd2`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0013/phase-2/sea-core.md`
Required environment: pinned Rust toolchain; no dependency or lockfile changes

## Assignment

Audit `sea-core` for low-risk documentation, code, and test improvements. Hypothesis: at least one useful improvement or a well-supported no-change result can be produced without changing public contracts. Inventory functions and methods against tests, then inspect the first nontrivial documentation or coverage gap as the cheapest check.

## Ownership

Writable: `rust-service/crates/sea-core/` and this report. Read-only: all other paths. Do not change public APIs, shared semantics, dependencies, formats, workspace manifests, lockfiles, or generated files.

## Expected Evidence

Report the full audit, focused changes, exact commits and checks, Notable Events, retained reproducers, and deferred opportunities. No machine-readable artifact is required.

## Validation

Guard the absolute checkout, branch, kickoff HEAD, and status. Run `cargo fmt --all -- --check`, `cargo clippy -p sea-core --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --all-features --no-deps`, `cargo test -p sea-core --all-targets --all-features`, affected README commands, `git diff --check`, and scope checks proving lockfiles and paths outside ownership are unchanged.

## Escalation and Stopping Conditions

Stop at architectural judgment or any forbidden shared change. Record broader opportunities and uncertain defects; a validated no-change audit is acceptable.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
