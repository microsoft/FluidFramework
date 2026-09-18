# Iteration 0015: decorators Instructions

Status: planned
Branch: `rust-service-iteration-0015-decorators`
Iteration source commit: `ff7d736642c2711b44ce0507b2319c188ff46129`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0015/phase-2/decorators.md`
Required environment: pinned Rust toolchain; no dependency, manifest, lockfile, encoded-format, cryptographic-policy, or dictionary changes

## Assignment

Independently verify inherited dispositions for `sea-compression`, `sea-encryption`, and `sea-stateful-compression`. The hypothesis is that conformance may pass while a decorator-owned transformation, validation, retry, or state decision is broken. Challenge every inherited row by naming that decision and checking whether the wrapped implementation can mask it.

## Ownership

Writable: the three decorator crate roots and this report. Read-only: all other paths and iteration `0014` evidence. Do not change dependencies, manifests, lockfiles, formats, cryptographic policy, dictionaries, or shared APIs.

## Expected Evidence

Reassess every inherited row, retain exact decision/test mappings, update inventory rows, and implement at most two unrelated repair clusters. Focused malformed-input, retry, or state-transition evidence must isolate the wrapper. A no-change result requires exact evidence. No machine-readable output is retained.

## Validation

Guard checkout identity. Run focused tests after edits, then workspace format, strict Clippy, warning-denied rustdoc, and all-target/all-feature tests for all three decorator crates, plus diff, lockfile, and ownership checks.

## Escalation and Stopping Conditions

Stop when all rows discriminate, after two unrelated repair clusters, or at format, security policy, shared API, dependency, or manifest changes. Record exact remaining risks and triggers.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
