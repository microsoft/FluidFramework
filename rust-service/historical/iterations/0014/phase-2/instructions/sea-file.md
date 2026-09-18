# Iteration 0014: sea-file Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-file`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-file.md`
Required environment: pinned Rust toolchain; disposable test directories allowed; no dependency, manifest, lockfile, or persistence-format changes

## Assignment

Audit `sea-file` for consequential documented-contract and localized-test gaps, prioritizing file lifecycle, partial I/O, recovery, cancellation, limits, and cleanup. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare consumers, documentation, implementation, tests, and prior report.

## Ownership

Writable: `rust-service/crates/sea-file/` and this report. Read-only: all other paths and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, persistence formats, shared APIs, or other crates. Remove disposable test data before completion.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. Each accepted change names the relied-upon contract and deterministic focused test, including cleanup assertions where relevant. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output or test directory is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-file --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file --all-features --no-deps`, `cargo test -p sea-file --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, a clean temporary-data check, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at durability or persistence-format claims, platform-specific redesign, dependencies or manifests, cross-crate edits, or disproportionate low-risk work. Record material deferred findings and revisit triggers. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
