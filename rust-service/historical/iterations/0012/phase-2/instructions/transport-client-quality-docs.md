# Iteration 0012: transport-client-quality-docs Instructions

Status: active
Branch: `rust-service-iteration-0012-transport-client-quality-docs`
Iteration source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0012/phase-2/transport-client-quality-docs.md`
Required environment: pinned Rust toolchain, Node.js, pnpm, and documented browser/WASM prerequisites; no new dependencies

## Assignment

Audit the Rust client, network/native/browser transports, and WASM/browser test packages against the documentation contract. Hypothesis: rustdoc, JSDoc where hand-authored TypeScript exists, and package READMEs can describe capability forwarding, framing, backpressure, cancellation, EOF, reconnect, and platform constraints without protocol or API changes. Inventory first and probe the first unsupported lifecycle claim.

## Ownership

Writable: `rust-service/crates/client/`, `crates/wrappers/network/`, `native-service-browser/`, `webtransport-browser/`, `webtransport-native/`, `tests/wasm-client/`, `tests/webtransport-browser/`, and this report. Protocol, service, minimal driver, and all other paths are read-only. Do not edit generated bindings, protocol or wire behavior, browser APIs, dependencies, root manifests or lockfiles, decisions, or shared records.

## Expected Evidence

- Before/after declaration and README inventory with generated exclusions and exemptions.
- Complete useful rustdoc or JSDoc and package READMEs covering capabilities, framing, lifecycle, errors, platform setup, limitations, and verified commands.
- Claim-to-test map and focused regression-first tests or fixes only for demonstrated gaps.
- Exact commits, fresh-consumer validation, contradictions, and residual risks in the report.

## Validation

Print and assert absolute checkout, branch, kickoff HEAD, and status. Run workspace format; Rust doc, strict Clippy, and tests for owned crates, including `RUSTFLAGS='--cfg=web_sys_unstable_apis'` where required; fresh Node/browser WASM builds and exact consumer tests; package TypeScript format, lint, typecheck, and tests where present; `git diff --check`; and verify manifests, lockfiles, and non-owned paths are unchanged. Remove ignored generated validation output before completion.

## Escalation and Stopping Conditions

Stop before protocol or wire, generated-source, browser API, public API, dependency, or shared semantic changes. Report cross-language contradictions. Environment-blocked browser checks must retain the exact blocker and strongest deterministic substitute.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
