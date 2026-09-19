# Iteration 0017 Phase 3 Report

Status: complete.
Approved source: `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`.
Kickoff: `cc2abb85cefb3a29e9b7d75e62986dff83e75680`.
Validated implementation input: `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`.
Phase 2 boundary: `4a66ed5a93b51f2bcb6cd37bc27dfc2ce4ac5b2c`; see the [integration report](phase-2/integration.md).
Phase 3 closeout: the commit containing this completed report.

## Evidence Summary

The [charter](charter.md) authorized an incremental audit of two boundaries per workstream and at most one repair cluster each.
The [inventory](quality-inventory.md) records six reviewed boundaries: two repaired test-evidence gaps, two already adequate, one partially adequate admission boundary with a deferred callback assertion, and one deferred browser-release boundary.
The signals and recovery hypotheses of complete existing coverage were each falsified for one selected conjunction; the other selected boundary in each workstream was adequate.
Transport's historical missing-stalled-handshake hypothesis was falsified by current real-QUIC tests, but its narrower callback and browser-release evidence gaps remain supported.

The coordinator inspected the signals `07dada7abbb`, transport `83e39e44d0e`, and recovery `f0a90d78272` commit objects, verified ownership, and accepted their clean merges at the input above.
[Execution evidence](execution-evidence.json) retains exact run clocks, identities, commands, exits, environment limits, and local raw-log paths.
Native integration passed all six gates, including warnings-denied rustdoc, and 174 tests with zero failures or ignored tests.
The runner explicitly supplies `RUSTDOCFLAGS=-D warnings`.

The coordinator accepted full run `integration-full-1789848676088-f31e277c-8f10-4a4f-b9b3-18a9f439bc33` after checking its JSON: exit 0, four commands each exit 0, and HEAD `42d577ab5d5e9df324a78e66bd23f6bb6e837f24`.
Frozen-lockfile installation, scoped policy, root build, and `./test.sh` passed; output inspection confirmed generated consumers, Node.js tests, and Chromium tests passed.
Raw logs remain local ignored artifacts; the compact evidence record preserves their provenance and accepted outcomes.

## Implementation Defects

No runtime implementation defect was demonstrated or repaired.
Accepted test-only repairs add a signals routing matrix and a recovery failed-close/shutdown barrier test under existing contracts.
Recovery's first check found one genuine formatting failure after tests and Clippy passed; the exact chain-layout correction and same-check rerun passed.
That failure is retained rather than replaced by the successful rerun.

## Shared Abstraction Findings

No shared product semantics, APIs, dependencies, crate boundaries, or conformance laws changed.
Admission cleanup counters cannot establish service callback invocation or the `false` argument to `connection_closed`.
Browser logical close/reopen, factory-open counts, and server shutdown cannot establish client physical release independently of final-owner drop.
These are supported evidence limitations, not demonstrated resource leaks or authorization failures.
Test-only browser lifetime controls cross generated-binding ownership and remain an approval-dependent proposal; generic disconnect failure semantics remain unselected.

## Decisions

Accept the bounded scope, two integrated test-only repairs, six inventory dispositions with their qualifiers, and coordinator-verified native and full validation.
Phase 2, quality, documentation, policy, local-link, and retained-evidence checks passed before closeout.
Proposals are a recording-service callback test and separate browser explicit-disconnect/final-drop tests; neither is authorized implementation or a next workstream.

No product decision record is required because the tests enforce existing promises and no shared product choice changed.
The already-applied skill/template refinement makes actual delegate discovery explicit and specifies parallel file-edit batches followed immediately by coordinator task checks.
Assessment: this clarifies the existing task-first fallback and immediate-validation policy, without changing ownership, scope, or authority; a new coordination-policy decision record is not required for that clarification.
See [skill review](skill-review.md#decisions); no accepted decision history is rewritten.

## Comparative Results

Both repairs reuse deterministic local fixtures; no production complexity or dependency increase is claimed.
There is no product performance, binary-size, or throughput comparison.
The three rendezvous processes ended at the same recorded Unix millisecond, and the three real checks overlapped with separate PIDs and result paths.
Their elapsed command-run durations were signals 15.168 s, transport 83.026 s, and recovery 19.816 s; recovery's later rerun took 2.295 s.
Full validation took 600.875 s, including 513.796 s for the root build.
These are observed runner intervals, not agent effort or a comparable sequential baseline; cache contention was observed and the rerun does not demonstrate an optimization.
Raw clocks are retained exactly, without inferred agent start/end times.

## Contract and Test Quality

| Boundary | Assessment and discriminating evidence |
| --- | --- |
| Signals document/recipient routing | Repaired: `document_scoped_routing_preserves_recipients_and_envelopes` checks live matching destinations in two rooms, exact sender/submission envelopes, broadcast/target/missing-target cases, and empty live nonrecipient queues under both delivery policies. |
| Signals slow-receiver isolation | Already adequate: `best_effort_drops_but_reliable_overflow_fails_only_slow_receiver` fails on changes to reliable-only eviction, `Lagged`/`Left` publication, or sender survival; this is owner-local evidence, not an authentication or exhaustive cascade guarantee. |
| Server admission cleanup | Partial/deferred: real-QUIC admission tests discriminate timeout, capacity recovery, listener survival, and cleanup counts. Neither proves service callback invocation or its `false` argument; counters do not close this evidence gap. |
| Browser physical release | Deferred: each `self.transport.close()` decision needs its own browser case with bounded server cleanup/capacity observation. Retain the owner after explicit disconnect; separately drop its final owner without disconnect. Teardown, expiry, and server shutdown must not mask either decision. |
| Sequencer failed reconciliation | Repaired: `failed_reconciliation_prevents_terminal_leave_until_recovery` crosses failed head/read with independent close/shutdown cases after membership announcement. Errors, append counts, retained exclusive opening, recovered operation identity, and `Joined, Application, Left` replay distinguish false finality. |
| File partial-I/O recovery | Already adequate: `journal_faults_preserve_prefix_and_block_uncertain_observations`, `exclusive_journal_round_trip_and_tail_policies`, and durable `recovery_preserves_dependencies_discards_torn_tail_and_rejects_corruption` discriminate poison guards, classification, exact retained bytes, and mode-specific tail decisions locally. |

Precise unchanged contract quotations and links are retained in the [signals](phase-2/signals.md#behavioral-contracts-and-test-layers), [transport](phase-2/transport.md#behavioral-contracts-and-test-layers), and [recovery](phase-2/recovery.md#behavioral-contracts-and-test-layers) reports and inventory.
Direct integrated-code inspection confirms recovery uses separate fixtures and a positive recovery path; no mutation experiment is claimed.
Shared conformance proves common laws, native composition proves cross-component behavior, and generated/browser checks prove distinct consumers; none substitutes for practical local diagnosis or physical-release evidence.
Independent static review found no high-confidence problems in either added test and supported the transport qualifiers; it ran no commands and is not independent runtime proof.
No production contract documentation or changeset is needed for these test-only repairs; adding duplicate broad tests or new promises would be unjustified churn.

## Learning and Process Findings

The [retrospective](retrospective.md) records blocked delegate discovery, coordinator-owned validation, package-cache contention, the genuine formatting failure, and partial task-output limitations.
No unexpected exit 130 or foreign checkout result was observed; no cancellation capability was available, so cancellation was not attempted or verified.
The coordinator removed the duplicate stale transport draft during integration.
The [learning index](../../../LEARNINGS.md#agentic-development) records the observed delegate-capability limitation and successful coordinator batching.
The [known issues](../../../KNOWN_ISSUES.md) retain the underlying terminal issue and admission callback evidence gap.

## Skill Changes

The [skill review](skill-review.md) records the already-applied refinement in the integration checkout's coordination skill and its two instruction templates, with a verification matrix separating tested behavior from unavailable capabilities.
No new skill, validator change, terminal fix, or autonomous scheduling result is claimed.
The existing per-child durable-evidence requirement remains necessary because task output can return before completion; require the matching completed `result.json` before accepting a gate.

## Next Iteration Scope

Stop the approved bounded audit; no next iteration, additional repair cluster, browser fixture expansion, or push is authorized.
The manifest's `nextWorkstreams` is empty and remains untouched.
Retain unresolved findings for their existing owners, not as scheduled work:

- Transport owner: revisit the callback argument when a recording-service test batch is authorized or admission/cleanup policy changes.
- Coordinator and WASM/browser owners: revisit physical release when test-only lifetime controls and server observation receive exact-path approval, or transport ownership changes.
- Signals owner: revisit routing/overflow on ownership or dispatch changes, a consumer requirement, or a concrete failing schedule.
- File/sequencer owners: revisit on reconciliation/settlement, journal parser/persistence policy changes, or a concrete recovery incident.
- Coordinator: revisit task access/cancellation only when the missing capabilities become available or attributable interference recurs.

Unselected candidates and explicit exclusions remain in the inventory; none is marked adequate or added to scope.

## Convergence Assessment

The bounded audit reduced two material owner-local evidence gaps, retained two justified no-change results, and preserved two precise transport deferrals without runtime edits or documentation churn.
Inherited findings were checked against current implementations; six reviewed boundaries do not imply exhaustive scope coverage or production/power-loss qualification.
The user-approved stopping decision ends this bounded audit with `nextWorkstreams` empty; unresolved triggers do not authorize another iteration or a push.
Native and full validation are accepted, including generated, Node.js, and Chromium consumers; commit ownership and clean merges were inspected.
The coordinator runs final complete/quality record validation and documentation/policy checks before committing this Phase 3 boundary.
The completed iteration remains on `rust-service-iteration-0017`; no merge into the user's `rust-service` checkout or push is performed.
