# Iteration 0015: transport Instructions

Status: planned
Branch: `rust-service-iteration-0015-transport`
Iteration source commit: `ff7d736642c2711b44ce0507b2319c188ff46129`
Owner: GitHub Copilot subagent
Report: `rust-service/iterations/0015/phase-2/transport.md`
Required environment: pinned Rust toolchain and WASM target; disposable endpoints allowed; no dependency, manifest, lockfile, wire-format, generated-artifact, or TLS-policy changes

## Assignment

Independently verify inherited dispositions for `sea-webtransport` and `sea-webtransport-server`. The hypothesis is that endpoint, fresh-client, protocol, generated, or browser coverage may pass while one connection-, stream-, or adapter-owned decision is broken. Challenge every inherited row by naming the exact decision and checking whether a sibling component or fresh connection can mask it.

## Ownership

Writable: both transport crate roots, `rust-service/tests/wasm-client/` when generated Node evidence is the narrowest practical layer, and this report. Read-only: browser and other consumer paths. Do not change dependencies, manifests, lockfiles, wire formats, generated artifacts, TLS policy, or shared APIs. Stop endpoints.

## Expected Evidence

Reassess every inherited row, retain exact decision/test mappings, update inventory rows, and implement at most two unrelated repair clusters. Focused Rust or generated Node evidence must isolate the owning boundary; broad platform evidence remains distinct. No generated or machine-readable output is retained.

## Validation

Guard checkout identity. Run focused checks after edits, then both packages' format, strict Clippy, warning-denied rustdoc, all-target/all-feature tests, WASM target check, generated Node suite when applicable, diff, lockfile, process, generated-artifact, and ownership checks.

## Escalation and Stopping Conditions

Stop when all rows discriminate, after two unrelated repair clusters, or at platform-only, handshake-fixture, wire, TLS, shared semantic, dependency, or manifest boundaries. Preserve explicit browser and handshake deferrals absent practical evidence.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
