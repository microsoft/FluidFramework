# Iteration 0014: sea-conformance Instructions

Status: active
Branch: `rust-service-iteration-0014-sea-conformance`
Iteration source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0014/phase-2/sea-conformance.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, or shared-contract changes

## Assignment

Audit `sea-conformance` for consequential documented-contract and test-layer gaps, prioritizing whether laws are implementation-independent, diagnostic, and distinct from implementation-local regression tests. The hypothesis is that risk-ranked inspection may find a material conformance-owned gap not adequately covered by iteration `0013`, or establish a supported no-change result. Start with the highest-risk law boundary and compare its contract, implementations, tests, and prior report before proposing a change.

## Ownership

Writable: `rust-service/crates/sea-conformance/` and this report. Read-only: all other paths, including implementations and iteration `0013` evidence. Do not change dependencies, manifests, lockfiles, shared trait semantics, implementation crates, or public cross-crate APIs.

## Expected Evidence

Report risk-ranked reviewed laws and proposed inventory rows. For each accepted change, identify the shared contract, implementations it applies to, and why the conformance assertion adds evidence beyond owning-crate tests. Flag broad assertions that substitute for practical implementation-local coverage. Retain at most two unrelated repair clusters. A validated no-change result is acceptable. No machine-readable output is retained.

## Validation

Guard the assigned worktree, branch, and base commit. After each edit run its focused check. Finish with `cargo fmt --all -- --check`, `cargo clippy -p sea-conformance --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc -p sea-conformance --all-features --no-deps`, `cargo test -p sea-conformance --all-targets --all-features`, `git diff --check`, an unchanged `Cargo.lock`, and a writable-path diff check.

## Escalation and Stopping Conditions

Stop at changes to shared semantics or trait contracts, dependency or manifest edits, implementation-crate changes, or assertions that cannot be justified across implementations. Record implementation-local gaps for integration without editing their crates. Stop after two unrelated repair clusters or when the next ranked candidate has no confirmed material gap.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
