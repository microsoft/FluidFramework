# Decision 0003: Iteration 0001 Scope

Status: accepted
Date: 2026-09-12
Iteration: foundation
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The first parallel iteration needs the smallest workstream set that tests the kernel across reference behavior, persistence, durability, transformation, and Fluid sequencing pressure.

## Decision Drivers

Workstreams must be independently writable, produce discriminating evidence, and avoid broad product implementation before the contract is validated.

## Options and Evidence

Encryption adds key and nonce policy before byte composition is established. Metrics-only delegation would not test a transforming wrapper. Per-record compression changes stored bytes while preserving logical append boundaries, making transparency falsifiable with conformance and recovery tests.

## Decision

Iteration `0001` uses the five workstreams in `WORKSTREAMS.md`: reference/conformance, minimal file, durable-log spike, per-record compression, and Fluid sequencer feasibility. Compression is the transparent wrapper experiment. Networking, encryption, browser storage, caching, and broad optimization remain deferred.

## Consequences

The iteration tests each major contract pressure with limited integration overlap. It does not answer transport or encryption composition questions, and compression results cannot be generalized to stateful block transforms.

## Validation and Follow-Up

The foundation workspace encodes each boundary as a crate. Phase 3 evaluates the evidence and selects, repeats, or removes workstreams rather than expanding automatically.
