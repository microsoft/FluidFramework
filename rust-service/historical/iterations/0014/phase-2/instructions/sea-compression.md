# Iteration 0014: sea-compression Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-compression`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-compression.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, or encoded-format changes

## Assignment

Audit `sea-compression` for consequential documented-contract and localized-test gaps, prioritizing transformation boundaries, malformed input, limits, error propagation, and wrapper transparency. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare consumers, documentation, implementation, focused tests, conformance evidence, and the prior report.

## Ownership

Writable: `rust-service/crates/sea-compression/` and this report. Read-only: all other paths, including wrapped contracts, consumers, and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, encoded formats, shared APIs, or other crates.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. Each accepted change names the wrapper-owned contract and deterministic focused evidence, distinguishing wrapper behavior from underlying service conformance. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-compression --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-compression --all-features --no-deps`, `cargo test -p sea-compression --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at encoded-format or shared-contract changes, dependency or manifest edits, cross-crate work, or performance redesign. Record material deferred findings and revisit triggers. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
