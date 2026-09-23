# Iteration 0012: fluid-driver-quality-docs Instructions

Status: active
Branch: `rust-service-iteration-0012-fluid-driver-quality-docs`
Iteration source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0012/phase-2/fluid-driver-quality-docs.md`
Required environment: Node.js and pnpm from the repository environment; installed root workspace and generated WASM packages may be used for validation but not committed; no new dependencies

## Assignment

Audit all hand-authored minimal-driver TypeScript and browser harness source against the documentation contract, prioritizing `src/wasmClient.ts`. Hypothesis: every named type and member can have useful JSDoc and the existing README can accurately cover driver, reconnect, benchmark, and generated-client workflows without changing APIs or behavior. Inventory first; verify the first important lifecycle claim lacking nearby coverage.

## Ownership

Writable: `rust-service/tests/minimal-fluid-driver/` and this report, excluding ignored or generated `pkg`, `pkg-local`, `dist`, `lib`, `benchmark-results`, dependencies, and retained evidence owned elsewhere. Rust crates, Fluid packages, root manifests or lockfiles, generated binding sources, decisions, and shared records are read-only. Do not change public Fluid APIs, benchmark workload semantics, dependencies, or generated output.

## Expected Evidence

- Before/after inventory for every hand-authored `.ts` and `.mts` source declaration and member, with explicit generated exclusions and exemptions.
- Useful JSDoc for all in-scope declarations and members, including every interface and property in `src/wasmClient.ts`; audit the README for purpose, lifecycle, limitations, generation, validation, and benchmark accuracy.
- Claim-to-test map for submission, projected reads and subscriptions, ambiguity, reconnect, disposal, blobs, summaries, and benchmark modes; focused regression-first fixes only for demonstrated defects.
- Exact commits, validation, contradictions, and residual risks in the report.

## Validation

Print and assert absolute checkout, branch, kickoff HEAD, and status. Run package format, lint, build, main typecheck, tests, benchmark bundle builds, and SharedTree typecheck where dependencies resolve. Generate fresh ignored WASM consumers when required and test the exact output; remove generated or temporary output afterward. Run `git diff --check` and verify root and Rust lockfiles and non-owned paths are unchanged. Execute every README command or identify canonical duplicates.

## Escalation and Stopping Conditions

Stop before Fluid public API, generated binding, benchmark semantic, dependency, protocol, or shared lifecycle changes. Report Rust/TypeScript contradictions for integration. Missing generated packages are an environment blocker to record, not a reason to hand-create tracked bindings.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
