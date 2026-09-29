# Iteration 0020 Phase 3 Report

Status: complete
Phase 2 integration commit: `9f64365338a1c317a31ccccd9031ac2f9286fd39`.
Phase 3 commit: the commit containing the completed closeout records.

## Evidence Summary

The [charter](charter.md) authorized full incremental review across all 15 workspace members since quality closeout `8bd1e64ebfa`, not a reassessment of every unchanged boundary.
Four isolated workstreams reviewed 98 boundaries; the coordinator added one root-documentation boundary.
The [inventory](quality-inventory.md) records 20 repaired, 74 already adequate, three excluded, one rejected and one explicitly deferred boundary.
No approved review area was omitted because of time or repair budget.

The accepted work strengthens exact owning-decision tests and corrects stale composition/default/storage descriptions.
Final canonical formatting, strict workspace Clippy/rustdoc, all-target build, documentation and policy checks passed.
The extended gate passed 454 native tests/doctests, with one browser-only test ignored by native execution and then run explicitly in the browser harness.
Package reports contain 25 TypeScript cases with one skipped socket-only case, 26 driver cases and one tree case; the real socket path is exercised separately by the transport harness.
All 30 integration/benchmark correctness cases passed.
The default and Sea-selected browser runs each produced 16 parseable passing evidence objects across WebTransport, WebSocketStream and WebSocket.
Fourteen generated Node/web WASM files were present, nonempty and had valid WASM headers.
These checks validate correctness boundaries, not a performance campaign.
Initial independent review covered the full checkpoint and found one localized byte-admission evidence gap.
The added regression passed before and after a bounded mutation that failed at the exact missing predicate.
Post-repair canonical native gates, all eight benchmark-script cases and complete serialized server tests passed.
The concurrent server suite reproduced the known timeout; the user explicitly accepted that validation exception while keeping the issue open.
Fresh repair review found no actionable findings and accepted the original finding as resolved.
The coordinator reverified the complete snapshot before committing Phase 2.
Identities and exact evidence are recorded in [integration](phase-2/integration.md#independent-review).

## Implementation Defects

A confirmed existing defect loses the initiating mutating timeout when stream cancellation also fails.
This can hide the documented ambiguous-outcome classification for supported custom transports.
The deterministic experiment covered submit, membership append and snapshot publication.
The user explicitly deferred the proposed compound-error API and corresponding fix; neither is in accepted source.

An intermittent native durable-opening timeout recurred during worker validation.
No targeted fix or causal attribution was established.
Later passing checks do not resolve it.
Both unresolved issues remain in [Known Issues](../../../KNOWN_ISSUES.md).
The long Chromium temporary path and missing dependencies were validation-environment failures, not source defects.

## Shared Abstraction Findings

The evidence supports retaining the existing storage, sequencer, policy, transform and transport ownership boundaries.
Private benchmark seams permit direct tests of writer decisions without a new public abstraction or per-operation allocation.
Scripted peer evidence isolates remote-factory choices that a real host can mask; retained composition tests cover the different end-to-end responsibility.
The compound-error experiment shows a real error-preservation need, but does not settle the public representation or migration policy.
Soft policy targets, visible transform metadata and qualified durability remain limitations, not new stronger guarantees.

## Decisions

[Decision 0030](../../decisions/0030-defer-compound-client-errors.md) accepts the user's decision to defer the API proposal and implementation repair.
It does not approve new variants or permanently reject that representation.
Revisit when an error representation/API migration is approved or a consumer needs reliable classification after failed cleanup.
No other shared semantics, crate boundaries, dependencies or public contracts were changed.

## Comparative Results

The checkpoint adds focused regression evidence and reconciles stale prose while preserving accepted runtime behavior.
Only private benchmark writer organization changed outside test code.
No dependencies, shared lockfiles or workspace members changed.
The API experiment is excluded from accepted size and behavior claims.
No runtime, throughput, allocation or code-size improvement was measured or claimed.
The larger boundary count than originally estimated reflects the incremental change window, not a coverage target.

## Contract and Test Quality

The four reports pair precise promises with controlling decisions and nearest tests, including no-change results.
Repairs discriminate actual writer pacing, partial writes, factory wire routing, inclusive pressure dimensions, wake notification, reader selection among multiple candidates, terminal resource release and rejection before storage dispatch.
These are narrower than merely invoking a related helper or checking eventual composition success.
Conformance continues to prove shared laws; generated bindings and browser tests retain distinct platform and physical-release responsibilities.
The root-documentation corrections align ownership and defaults with implementation instead of broadening guarantees.
The timeout ambiguity promise was not weakened to fit the deferred defect.
Initial independent review required separating byte-only admission from byte-pressure shedding evidence.
The added test disables background shedding and observes session/reader decisions and permit accounting directly.
The repaired boundary retains its inventory identity; no new row was manufactured for the review cycle.

## Learning and Process Findings

The [retrospective](retrospective.md) records local dependency restoration, fixture-path failure and repair, native timeout evidence, the semantic deferral, delayed peer routing, the inconclusive editor diagnostic and evidence-reference correction.
The short-path Chromium observation is retained in [LEARNINGS.md](../../LEARNINGS.md).
Current ownership/default corrections live in the relevant guides, not only in this history.
Known limitations and the deferred choice remain discoverable from current Known Issues.

## Skill Changes

The [skill review](skill-review.md) rechecks triggers from iterations 0018 and 0019.
No reusable skill, template or canonical validation-policy change is justified.
Existing guidance already requires exact boundary evidence, explicit semantic escalation, authoritative handoffs and fixed-base review.
The short fixture root is a local execution choice; cancellation isolation and throughput improvement remain unverified.

## Next Iteration Scope

The user accepted the known-timeout validation exception and instructed proceeding through final repair review to closeout.
No next workstream is authorized; `nextWorkstreams` remains empty.
Recommended follow-up, if requested, is a targeted public error-representation design or instrumentation of the unattributed native opening timeout, not another broad unchanged-boundary audit.

## Convergence Assessment

The approved incremental coverage is accounted for, localized evidence gaps were repaired, and accepted production behavior/API is unchanged.
Inherited transport deferrals were rechecked where implemented changes supplied a concrete trigger.
The one new confirmed implementation defect remains an explicit repair deferral, not incomplete review coverage.
Canonical and platform checks passed after concrete environment corrections.
The later concurrent server failure remains visible with the user's explicit exception; the isolated and serialized diagnostics are not presented as a repair.
Fresh independent repair acceptance is complete with no unresolved blocking findings.
Both the repair deferral and validation exception have explicit user authorization, current issue records and concrete revisit triggers.
The final global record validator reports nine missing-template-heading errors in pre-existing Decisions 0028 and 0029.
Both decisions and the validator are unchanged from the approved source, and validating completed iteration 0019 reproduces the same errors.
The user explicitly approved recording this historical-formatting exception and finishing closeout without rewriting those decisions.
Iteration 0020 inventory and Phase 2 checks pass; the complete-validator result is an accepted exception, not a passing check.
The user approved closeout rather than another iteration.
Worker checkouts, owned temporary fixture roots and temporary tasks were cleaned up with source mappings and retained evidence verified.
Final integration-checkout removal follows acceptance of the closeout commit into the primary branch and is recorded in the integration report.
