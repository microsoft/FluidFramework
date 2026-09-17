# Iteration 0014: sea-benchmarks Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-benchmarks`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-benchmarks.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, workload, or retained-result changes

## Assignment

Audit `sea-benchmarks` for consequential documented-contract and localized-test gaps, prioritizing workload semantics, measurement boundaries, failure reporting, and assumptions made about exercised services. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare its consumers, documentation, implementation, tests, and prior report before proposing a change.

## Ownership

Writable: `rust-service/crates/sea-benchmarks/` and this report. Read-only: all other paths, including iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, benchmark workloads or result schemas, other crates, shared APIs, or retained measurements.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. For each accepted change, identify the relied-upon contract and focused crate evidence; distinguish benchmark integration evidence from tests of dependencies. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused check. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-benchmarks --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-benchmarks --all-features --no-deps`, `cargo test -p sea-benchmarks --all-targets --all-features`, `cargo run -p sea-benchmarks -- smoke`, `git diff --check`, an unchanged `Cargo.lock`, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at workload or result-schema changes, shared service semantics, dependency or manifest edits, cross-crate ownership, or work whose maintenance cost is disproportionate to demonstrated risk. Record material deferred findings and revisit triggers. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
