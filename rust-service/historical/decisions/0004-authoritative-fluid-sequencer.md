# Decision 0004: Authoritative Fluid Sequencer

Status: accepted
Date: 2026-09-12
Iteration: 0001
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The Fluid spike showed that committed opaque order can derive deterministic final sequence metadata, but validation of writer-local order and reference positions can reject a submission only after it has already entered the raw stream. Existing Fluid behavior rejects stale or invalid operations and requires the client to reconnect as a new session and regenerate pending operations.

## Decision Drivers

The canonical Fluid log should contain only accepted operations. Kernel receipts must retain their storage meaning. Stale clients need explicit protocol rejection, while high-availability sequencing must not allow two instances to validate against the same predecessor and both commit authoritative state.

## Options and Evidence

A derived-only projection is simple but leaves rejected frames in the canonical raw stream. Adding conditional append to the kernel immediately would burden every implementation before distributed evidence establishes exact semantics. The `fluid-sequencer` tests prove deterministic post-commit projection and separately minimize the authoritative-acceptance gap.

## Decision

Place an authoritative Fluid sequencer service in front of the opaque append stream. It serializes submissions, validates session identity, writer-local order, and reference position against the current minimum, assigns final metadata, and appends only accepted framed operations. Invalid operations are rejected before kernel append; a stale client reconnects under a new session and regenerates or rebases pending operations before resubmission.

A successful Fluid submission means protocol acceptance plus successful storage append. The underlying `AppendReceipt` continues to mean only that opaque bytes were committed. Iteration `0002` tests a single active sequencer with explicit fencing and ambiguous-append recovery before considering a generic conditional-append capability.

## Consequences

The kernel remains payload-agnostic and the canonical Fluid log remains valid-only. Clients require a sequencing acknowledgement distinct from direct storage receipts. Multiple sequencer instances require leader fencing or a future atomic compare-and-append primitive. An ambiguous storage outcome requires stream recovery and submission identity; it must not be blindly retried.

## Validation and Follow-Up

Iteration `0002` must test stale-reference rejection before append, reconnect as a new session, regenerated resubmission, fencing loss, and ambiguous append recovery. Promote conditional append only if deployment-level fencing cannot provide the required invariant.
