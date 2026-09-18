# Iteration 0014: sea-webtransport-server Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-webtransport-server`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-webtransport-server.md`
Required environment: pinned Rust toolchain; disposable native endpoints allowed; no dependency, manifest, lockfile, wire-format, TLS-policy, or shared-contract changes

## Assignment

Audit `sea-webtransport-server` for consequential documented-contract and localized-test gaps, prioritizing connection and logical-stream lifecycle, dispatch, malformed clients, liveness, resource limits, cleanup, and shutdown. The hypothesis is that risk-ranked inspection may find a material crate-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk boundary and compare consumers, documentation, implementation, focused native tests, broader transport or browser evidence, and the prior report.

## Ownership

Writable: `rust-service/crates/sea-webtransport-server/` and this report. Read-only: all other paths, protocol/client crates, browser harnesses, consumers, and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, wire formats, TLS policy, shared service semantics, other crates, or browser tests. Stop all endpoints started for validation.

## Expected Evidence

Report risk-ranked reviewed boundaries and proposed inventory rows. Each accepted change names the server-owned lifecycle or dispatch contract, deterministic focused native evidence, and the distinct responsibility of any broader transport or browser test. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused test. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-webtransport-server --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-webtransport-server --all-features --no-deps`, `cargo test -p sea-webtransport-server --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, no live owned endpoint, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at wire, TLS, shared service, or cross-crate semantic changes; dependencies or manifests; browser-harness edits; architecture work; or tests that cannot be made deterministic. Preserve a focused reproducer when practical and record the required broader evidence. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
