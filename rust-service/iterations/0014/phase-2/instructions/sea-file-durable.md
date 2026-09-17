# Iteration 0014: sea-file-durable Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-file-durable`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-file-durable.md`
Required environment: pinned Rust toolchain; disposable test directories allowed; no dependency, manifest, lockfile, or persistence-format changes

## Assignment

Audit `sea-file-durable` for consequential documented-contract and localized-test gaps, prioritizing durability claims, crash recovery, corruption, partial writes, synchronization, and cleanup. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare consumers, documentation, implementation, tests, and prior report.

## Ownership

Writable: `rust-service/crates/sea-file-durable/` and this report. Read-only: all other paths and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, durability or persistence semantics, encoded formats, shared APIs, or other crates. Remove disposable test data before completion.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. Each accepted change names the exact durability or recovery contract and deterministic focused evidence without strengthening claims beyond tested guarantees. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output or test directory is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-file-durable --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-file-durable --all-features --no-deps`, `cargo test -p sea-file-durable --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, a clean temporary-data check, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at stronger durability claims, persistence-format or platform redesign, dependencies or manifests, cross-crate edits, or tests that require unavailable power-loss evidence. Record the residual risk and revisit trigger. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
