# Iteration 0012: examples-benchmarks-quality-docs Instructions

Status: active
Branch: `rust-service-iteration-0012-examples-benchmarks-quality-docs`
Iteration source commit: `1625f1d161a8f1eca2e51c811bb6b29e15ac1fd5`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0012/phase-2/examples-benchmarks-quality-docs.md`
Required environment: pinned Rust toolchain plus Node.js and pnpm for documentation tooling inspection; no new dependencies

## Assignment

Audit examples, benchmarks, the durable-log spike, retained benchmark organization, and local scripts against the documentation contract. Hypothesis: entry-point rustdoc, local READMEs, and accurate evidence guidance can make these surfaces runnable and clearly bounded, while a documentation coverage inventory can recommend maintainable repository enforcement. Inventory first and execute the first stale or missing documented command.

## Ownership

Writable: `rust-service/crates/benchmarks/`, `crates/spikes/durable-log/`, `examples/counter/`, `examples/native-service/`, `benchmarks/`, `scripts/`, and this report. Production crates, retained result payloads, root docs, manifests or lockfiles, shared tooling, decisions, and other reports are read-only. Do not rewrite historical benchmark evidence or change workloads, production semantics, dependencies, or shared policy.

## Expected Evidence

- Before/after declaration and README inventory with exemptions and explicit retained or generated exclusions.
- Complete useful rustdoc and audited READMEs for owned packages, examples, and spike; concise READMEs for owned important grouping folders where missing, with purpose, contents, limitations, provenance, and verified commands.
- A report recommendation for an automated repository documentation check, including discovery rules, exclusions, output invariants, and false-positive analysis; implement only within `rust-service/scripts/` if low-risk and dependency-free.
- Claim-to-test map, regression-first focused fixes if defects are reproduced, exact commits, validation, and residual risks.

## Validation

Print and assert absolute checkout, branch, kickoff HEAD, and status. Run workspace format; Rust doc, strict Clippy, and tests for owned packages; execute both examples and applicable benchmark or spike smoke checks; syntax, lint, and test any added script; validate local Markdown links and retained evidence references; run `git diff --check`; and verify manifests, lockfiles, retained result payloads, and non-owned paths are unchanged.

## Escalation and Stopping Conditions

Stop before production semantic, benchmark workload, retained evidence, dependency, root policy, or shared tooling changes outside ownership. Escalate enforcement that requires broad source exceptions. A documentation-only result is acceptable with complete inventories and validated commands.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
