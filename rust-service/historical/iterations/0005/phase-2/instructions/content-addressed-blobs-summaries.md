# Iteration 0005: content-addressed-blobs-summaries Instructions

Status: planned
Branch: `rust-service-iteration-0005-content-addressed-blobs-summaries`
Iteration source commit: `2de3d94f89ecff3e340eb1d580d628d5d951681b`
Owner: assigned iteration `0005` implementation agent
Report: `rust-service/iterations/0005/phase-2/content-addressed-blobs-summaries.md`

## Assignment

Implement durable content-addressed blob upload/fetch and atomic summary manifests with integrity validation. Hypothesis: immutable blobs keyed by a cryptographic digest and a validated manifest can compose above existing durable primitives without kernel changes or GC semantics. Disprove first with an interruption/reopen trace that exposes an acknowledged manifest whose referenced blob is absent, corrupt, or returns different bytes.

## Ownership

Wave 1 writable: new blob/summary crates, focused tests/examples, and this report. Protocol/service/client paths remain read-only until the coordinator integrates the projected-read/recovery prerequisite into this branch and explicitly opens Wave 2 ownership for blob/summary operations. Core, existing storage/wrappers, prior decisions, root workspace membership, and lockfile remain read-only. Do not implement pruning, reader leases, cloud storage, mutable blob replacement, or weaken digest verification.

## Expected Evidence

Deliver bounded or streaming upload/fetch, cryptographic digest verification, idempotent duplicate upload, missing/corrupt stable errors, durable reopen, and atomic summary publication that verifies references before acknowledgement. Cover interruption before/during/after blob and manifest persistence, duplicate content, malformed digest, configured size limits, concurrent identical upload, and process restart. Measure persisted amplification and memory bounds for seeded small and large blobs.

## Validation

Print absolute checkout, branch, and HEAD. Run focused format, strict Clippy, tests, fault/process tests, and applicable conformance with an isolated target. Validate new dependencies in an exact disposable copy and immediately verify source root manifest/lockfile hashes. After the protocol prerequisite handoff, rerun all focused checks plus service round trips. Finish with `git diff --check`, clean status, and exact evidence in the report.

## Escalation and Stopping Conditions

Stop if publication can acknowledge dangling references, integrity trusts caller metadata without recomputation, bounded reads/uploads cannot be expressed, or correctness requires retention/GC or a kernel change. Stop before editing shared protocol paths without the coordinator handoff. Preserve a minimal crash trace and proposed atomic boundary rather than adding an undocumented workaround.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
