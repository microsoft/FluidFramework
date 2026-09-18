# Iteration 0014: sea-core Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-core`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-core.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, or public semantic changes

## Assignment

Audit `sea-core` for consequential documented-contract and localized-test gaps, prioritizing shared traits, monitored streams, error classification, value invariants, and assumptions made by multiple implementations. The hypothesis is that risk-ranked inspection may find a material core-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk contract and compare consumers, documentation, implementations, tests, and prior report.

## Ownership

Writable: `rust-service/crates/sea-core/` and this report. Read-only: all other paths, implementations, consumers, and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, public semantics, wire or persistence formats, or other crates.

## Expected Evidence

Report risk-ranked reviewed contracts and proposed inventory rows. Each accepted change identifies actual consumer reliance and focused core evidence; identify implementation or conformance follow-up without editing those owners. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test or rustdoc check. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-core --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --all-features --no-deps`, `cargo test -p sea-core --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop when clarification would create a new shared guarantee, require implementation changes, alter public semantics, or touch dependencies, manifests, formats, or other crates. Record the question and affected consumers for Phase 3. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
