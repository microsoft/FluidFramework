# Iteration 0014: sea-counter Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-counter`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-counter.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, or production API changes

## Assignment

Audit the `sea-counter` example for consequential documented assumptions and localized executable-test gaps, prioritizing demonstrated lifecycle, recovery, error handling, and claims made to users. The hypothesis is that risk-ranked inspection may find a material example-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk example behavior and compare documentation, implementation, executable checks, production contracts, and the prior report.

## Ownership

Writable: `rust-service/examples/sea-counter/` and this report. Read-only: all production crates, workspace documentation, and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, production APIs, other crates, or workspace-level documentation.

## Expected Evidence

Report risk-ranked reviewed example boundaries and proposed inventory rows. Each accepted change identifies the production contract relied upon and the smallest executable example or test evidence that verifies the example's own behavior without duplicating production tests. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused check. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-counter --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-counter --all-features --no-deps`, `cargo test -p sea-counter --all-targets --all-features`, `cargo run -p sea-counter`, `git diff --check`, an unchanged `Cargo.lock`, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at production API or semantic changes, dependencies or manifests, cross-crate edits, or attempts to turn the example into a comprehensive integration suite. Record upstream gaps separately. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
