# Shared Change Review Criteria

Use these criteria for interactive branch reviews and independent checkpoint reviews.
The invoking workflow owns scope, comparison selection, delegation, execution permissions, and report routing.
These criteria do not authorize edits or commands.

## Review Areas

- Correctness: trace changed behavior through callers, shared state, failure handling, concurrency, ordering, cancellation, and recovery.
- API quality: check compatibility, naming, type and handle capabilities, lifecycle contracts, cross-package consumers, and migration requirements.
  Use the language-specific repository conventions; use [API conventions](api-conventions.md) for applicable TypeScript surfaces rather than imposing them on other languages.
- Architecture: identify unnecessary coupling, duplicated ownership, stale paths, and complexity introduced by the change.
- Tests: examine assertions and failure injection, not only test names or reported counts; identify which contract a missing test leaves unverified.
- Performance: examine hot-path work, algorithmic complexity, allocation capacity and lifetime, synchronization, and whether measurements exercise the changed path.
- Security: check trust boundaries, input validation, injection, sensitive data handling, and resource exhaustion.

Read changed call sites and adjacent wrappers when a change threads a capability, callback, flag, or ownership token through shared code.
Trace at least the relevant success and failure paths to their controlling implementation rather than judging forwarding code alone.
Challenge the design premise when the change adds cost or coupling without evidence for its stated benefit; distinguish that concern from a demonstrated implementation bug.

## Adversarial Checks

Seek concrete counterexamples, not confirmation of the implementer's explanation.
Choose checks appropriate to the touched boundary, such as cancellation before and after ownership transfer, concurrent close, partial output, failed persistence, stale callbacks, empty and maximum inputs, or reclamation while a downstream handle survives.
For resource claims, distinguish struct size, collection capacity, retained backing allocations, and transient overlap.
For performance claims, verify source and binary provenance, activation, workload comparability, and measurement boundaries.
Do not demand unrelated future functionality from an intentionally inactive checkpoint, but flag a dependency that makes its claimed guarantees false.

## Evidence Gate

Before reporting a finding, establish all four:

1. The changed or directly affected code path is identified with file and line evidence.
2. A concrete failure mechanism or violated contract is explained, including necessary preconditions.
3. The impact is proportional to the evidence.
4. The proposed correction addresses that mechanism, with a focused reproduction or regression check when possible.

If a claim depends on guessed dependency behavior, read the controlling code or mark the question unverified rather than reporting a confirmed defect.
Separate directly inspected evidence, implementer-reported validation, reviewer-executed checks, and unresolved assumptions.
Do not invent test counts, execution results, allocation estimates, or scope coverage.
Passing tests do not prove untested contracts; an absence of findings does not establish correctness.
Keep material missing evidence visible as a review limitation, not as a speculative bug or silent approval.

## Findings And Severity

Each finding includes severity, area, file/line, failure scenario, impact, and a proposed correction or focused check.
Deduplicate by underlying mechanism, not merely by location.
Keep optional improvements separate from correctness and contract findings.

- CRITICAL: demonstrated exposure to catastrophic impact, such as broad data loss or a severe security compromise.
- HIGH: a concrete serious correctness, compatibility, security, or availability failure in a supported path.
- MEDIUM: a concrete localized defect, material regression, or missing required contract evidence with a narrower impact.

Choose severity from impact and reachability; do not automatically promote correctness/API findings or cap security findings by category.
Do not turn generic hardening advice into a defect.
State what was not reviewed and which required guarantees remain unverified, even when there are no high-confidence findings.