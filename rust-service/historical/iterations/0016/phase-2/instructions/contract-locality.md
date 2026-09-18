# Iteration 0016: contract-locality Instructions

Status: planned
Branch: `rust-service-iteration-0016-contract-locality`
Iteration source commit: `69f0e22ed3a7e659bf9ed3af77ce08d22e96a156`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0016/phase-2/contract-locality.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, format, wire, security-policy, durability-policy, or shared-semantic changes

## Assignment

Independently challenge all iteration `0015` `already adequate` dispositions for precise contract text and practical owner-local diagnosis. Quote or link each contract, name the decision and local test, and implement at most two confirmed material gaps.

## Ownership

Writable: Rust crate roots and this report. Read-only: generated artifacts, non-Rust packages, application/browser consumers, and iteration history. Do not change dependencies, manifests, lockfiles, formats, public semantics, policy, or deferred platform/fault scopes.

## Expected Evidence

Produce a compact table for every inherited adequate row with precise contract text, owning decision, nearest local assertion, and disposition. For up to two gaps, add concise contract text and deterministic owner-local tests; retain broader evidence only for distinct responsibilities. No machine-readable output is retained.

## Validation

Guard checkout identity and run focused checks after edits. Finish with `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps`, `cargo test --workspace --all-targets --all-features`, `node scripts/check-documentation.mjs`, `git diff --check`, unchanged lockfiles, and writable-path validation.

## Escalation and Stopping Conditions

Stop after two unrelated repair clusters, when all rows satisfy both requirements, or at shared semantic, format, dependency, manifest, generated, platform, or fault-fixture boundaries. Record remaining gaps and precise revisit triggers.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
