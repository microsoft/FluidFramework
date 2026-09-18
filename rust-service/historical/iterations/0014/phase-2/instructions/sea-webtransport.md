# Iteration 0014: sea-webtransport Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-webtransport`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-webtransport.md`
Required environment: pinned Rust toolchain and installed WASM target; no dependency, manifest, lockfile, wire-format, generated-artifact, or binding-shape changes

## Assignment

Audit `sea-webtransport` for consequential documented-contract and localized-test gaps, prioritizing protocol validation, correlation, cancellation, client logical-stream lifecycle, error propagation, and native/WASM behavioral parity. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare consumers, documentation, shared implementation, focused tests, generated or platform evidence, and the prior report.

## Ownership

Writable: hand-authored files under `rust-service/crates/sea-webtransport/` and this report. Read-only: all other paths, generated package outputs, server code, consumers, and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, wire formats, generated artifacts or declarations, binding shapes, shared APIs, or other crates.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. Each accepted change names the shared-client or protocol contract, deterministic focused Rust evidence, and the distinct responsibility of any generated-binding or browser evidence. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No generated or machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-webtransport --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-webtransport --all-features --no-deps`, `cargo test -p sea-webtransport --all-targets --all-features`, `env RUSTFLAGS=--cfg=web_sys_unstable_apis cargo check -p sea-webtransport --target wasm32-unknown-unknown --all-features`, `git diff --check`, an unchanged `Cargo.lock`, no generated diffs, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at wire or binding changes, server or consumer edits, dependencies or manifests, cross-crate APIs, architecture changes, or browser-only claims that cannot be proven in the assigned environment. Record the distinct missing boundary evidence and revisit trigger. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
