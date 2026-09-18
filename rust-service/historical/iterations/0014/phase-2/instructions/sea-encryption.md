# Iteration 0014: sea-encryption Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-encryption`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-encryption.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, key-policy, nonce-policy, or encoded-format changes

## Assignment

Audit `sea-encryption` for consequential documented-contract and localized-test gaps, prioritizing authentication, key and nonce assumptions, malformed input, replay boundaries, error propagation, and wrapper transparency. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare consumers, documentation, implementation, tests, and prior report.

## Ownership

Writable: `rust-service/crates/sea-encryption/` and this report. Read-only: all other paths, wrapped contracts, consumers, and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, cryptographic policy, encoded formats, shared APIs, or other crates.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. Each accepted change names the encryption-wrapper-owned contract and deterministic focused evidence without making unsupported security claims. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No secrets or machine-readable output are retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-encryption --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-encryption --all-features --no-deps`, `cargo test -p sea-encryption --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at cryptographic design, key or nonce policy, encoded formats, dependencies or manifests, cross-crate edits, or security claims lacking suitable evidence. Record material risks and revisit triggers. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
