# Iteration 0005: content-addressed-blobs-summaries Instructions

Derived from iteration: 0004
Status: planned
Owner: assigned iteration `0005` implementation agent

## Approved Scope

Implement durable content-addressed blob upload/fetch and atomic summary manifests with integrity validation. Establish lifetime/reference policy sufficient for correctness while explicitly deferring pruning and garbage collection.

## Prior Evidence

The iteration `0004` [Phase 3 report](../phase-3-report.md#next-iteration-scope) selects blobs/summaries as a prerequisite for the minimal Fluid driver. [Decision 0006](../../../decisions/0006-scoped-deployment-boundaries.md) limits deployment claims to the accepted single-host prototype. Snapshot publication and opaque position semantics remain controlling; retention is not yet authorized.

## Hypothesis and Discriminating Check

Hypothesis: immutable blobs keyed by a cryptographic digest and an atomically published summary manifest can compose above existing durable primitives without kernel changes or GC semantics. Disprove first with a crash/reopen trace that exposes a published manifest whose referenced blob is absent, corrupt, or returns different bytes.

## Ownership and Dependencies

Wave 1 may build a new isolated blob/summary core and tests concurrently with projected reads. Do not edit shared FSP4/service files until the projected-reads protocol prerequisite is integrated into this branch; then add blob/summary protocol operations in Wave 2. Writable paths are new blob/summary crates, their tests/examples/report, and later assigned protocol/service/client paths. Integration owns root membership and lockfile. Do not implement pruning, reader leases, cloud storage, mutable blob replacement, or claim transactional guarantees beyond the tested manifest boundary.

## Deliverables and Validation

Deliver streaming or bounded upload/fetch, digest verification, idempotent duplicate upload, missing/corrupt classification, durable reopen, and atomic summary publication whose references are validated before acknowledgement. Include interruption before/during/after blob and manifest persistence, duplicate content, malformed digest, size limits, and process restart. Run focused format, strict Clippy, tests, fault injection, and applicable conformance. Stop if publication can acknowledge dangling references, integrity depends on trusted caller metadata, or safe semantics require premature retention/GC decisions.
