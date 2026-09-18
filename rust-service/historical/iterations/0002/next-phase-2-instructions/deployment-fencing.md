# Iteration 0003: deployment-fencing Instructions

Derived from iteration: 0002
Status: planned
Owner: GitHub Copilot deployment-fencing agent

## Approved Scope

Prototype and fault-test a deployment-backed lease or epoch authority for the authoritative sequencer. The authority must reject a stale owner and remain exclusive from fence validation through the storage append. Keep the kernel payload-agnostic and do not add conditional append unless a minimized cross-process trace proves the service boundary cannot provide this property. This scope was approved in [iteration 0002 Phase 3](../phase-3-report.md#next-iteration-scope).

## Prior Evidence

[Decision 0004](../../../decisions/0004-authoritative-fluid-sequencer.md) places Fluid validation above the kernel. The [authoritative sequencer report](../phase-2/authoritative-sequencer.md) proves valid-only storage, replay, deduplication, ambiguity recovery, and fencing only for instances sharing one process-local gate. The [integration findings](../phase-2/integration.md#cross-workstream-findings) identify cross-process fencing as the remaining production boundary.

## Hypothesis and Discriminating Check

A deployment-backed epoch or lease can serialize ownership change with append so that two sequencer processes cannot both append successors under different ownership views. The cheapest disproof is a deterministic two-process trace that pauses the old owner after validation, rotates ownership, resumes both contenders, and observes an old-owner append or two accepted successors.

## Ownership and Dependencies

- Writable paths: `crates/fluid-sequencer/` and this workstream's iteration `0003` report.
- Dependencies: accepted `AuthoritativeSequencer`, `SequencerStorage`, `KernelStream`, and Decision 0004.
- The workstream may add dependencies owned by the Fluid sequencer crate, but must not commit a shared lockfile change; report required integration regeneration.
- Do not edit core, conformance, durable-log, network, decisions, or another workstream's report. Stop with a minimized trace before proposing kernel conditional append or changing accepted semantics.

## Deliverables and Validation

- Provide deterministic stale-owner, lease-rotation-during-append, process-loss, replacement replay, and ambiguity traces. Include at least one actual multi-process contention test.
- State the exact authority and failure model; distinguish process exclusion from storage-level distributed fencing and do not claim guarantees the backing mechanism cannot enforce.
- Measure ownership handoff behavior and append overhead only under a documented equivalent workload.
- Run focused tests, strict package Clippy, workspace formatting, and an unchanged-lockfile check; record checkout identity and exact outcomes.
- Stop if exclusivity cannot span validation through append. Report the smallest missing atomic capability and evidence instead of weakening valid-only semantics.
