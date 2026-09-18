# Decision 0007: Projected Reads and Ambiguity Recovery

Status: accepted
Date: 2026-09-12
Iteration: 0004
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

Iteration `0004` exposed two adjacent FSP4 limitations. Historical reads return private canonical FSQ2 records, including administrative records, rather than accepted Fluid operations. Separately, the sequencer can resolve an ambiguous storage append internally, but a still-running service exposes only `RecoveryRequired`; FSP4 clients must currently wait for service recovery before stable-identity replay can return `Accepted` or `Duplicate`.

## Decision Drivers

Fluid drivers need operation history without copying private storage decoders. Disconnect recovery must distinguish committed work from work known to be absent without hidden retry, duplicate operations, or service restart. Resume positions must remain opaque, finite reads bounded, and the generic kernel payload-agnostic.

## Options and Evidence

Keeping canonical reads public would force Rust, WASM, and TypeScript clients to duplicate FSQ2 decoding. Decoding only in a Fluid driver would repeat that coupling for every driver. The service report and benchmark's 201-record result for 200 submissions demonstrate the mismatch. For ambiguity, automatic retry cannot distinguish disconnect-before-commit from disconnect-after-commit; the native lifecycle tests correctly preserve both as ambiguous. The existing sequencer replay resolver proves that authoritative resolution can live above storage without changing the kernel.

## Decision

Add a sequencer-owned projected read API and corresponding FSP4 operation that returns accepted Fluid operations, filters administrative records, preserves sequence/reference metadata, and resumes with opaque cursors without gaps, duplicates, or loops across filtered spans.

Add an explicit idempotent FSP4 ambiguity-resolution operation keyed by the stable submission identity and authorized document/writer/session context. Its result distinguishes committed, not committed, and still uncertain. Clients never retry or regenerate automatically; they act only on an authoritative result.

Neither capability changes `AppendStream`, `SnapshotStore`, position ordering, or storage receipt semantics.

## Consequences

The sequencer and protocol gain a product-facing projection surface and recovery operation. Clients stop depending on private FSQ2 framing and can recover a live service without restart when replay is decisive. Protocol compatibility, authorization context, pagination through administrative-only spans, repeated resolution, and restart behavior require new tests. Raw canonical reads may remain internal for diagnostics but are not the Fluid driver contract.

## Validation and Follow-Up

Iteration `0005` owns implementation. Required evidence includes mixed administrative/operation pages, exact opaque resume, bounded empty projected pages, disconnect before and after commit, lost resolution responses, repeated resolution, restart during recovery, wrong ownership, and no duplicate canonical append. Reconsider only if the projection cannot preserve finite-reader laws or authoritative resolution requires weakening stable identity or fencing.