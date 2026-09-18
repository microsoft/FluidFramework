# Iteration 0001 Retrospective

## What We Expected

Five isolated workstreams would test the kernel across reference semantics, simple persistence, durable recovery, one transforming wrapper, and Fluid protocol pressure. Shared conformance and strict ownership were expected to permit conflict-light integration while allowing precise contract gaps instead of speculative API growth.

## What We Observed

All five workstreams completed and integrated without source conflicts. Storage and compression fit the existing traits. Fluid replay derived deterministic final metadata, falsifying the broad expectation that final ordering itself required conditional append, while a smaller test proved authoritative valid-only acceptance requires fenced serialization. Position serialization was the only immediate public operation missing. Parallel execution of compression and Fluid sequencing completed successfully while durable-log continued independently.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Branch names using `rust-service/iteration-*` collided with existing branch `rust-service`; creating hyphenated refs and recording deviations affected every report. Root cause was missing Git ref preflight.
- Crate manifests required root `Cargo.lock` changes that agents did not own. Disposable-copy validation worked, but two delegated commands still mutated assigned lockfiles and required exact surgical restoration. Evidence: [file-simple](phase-2/file-simple.md), [durable-log](phase-2/durable-log.md), and [compression](phase-2/compression.md).
- Multi-worktree execution summaries twice reported neighboring checkout results or omitted authoritative output. Checkout markers and direct concise commands were needed to establish trustworthy evidence. Evidence: [compression](phase-2/compression.md) and [durable-log](phase-2/durable-log.md).
- The host reboot interrupted the durable workstream before implementation. Clean worktrees and committed instructions allowed exact recovery with no lost artifact. Evidence: [durable-log](phase-2/durable-log.md).

## Agentic Development Findings

Ownership decomposition was effective: implementation paths did not overlap and all ten commits cherry-picked cleanly. The initial sequential dispatch underused that design; after user correction, compression and Fluid sequencing ran concurrently and completed cleanly. Instructions correctly stopped shared API edits, but their slash branch names and foundation-base fields did not match actual kickoff provenance. Delegated validation needs stronger checkout identity and lockfile guards. User intervention was required for the valid-only Fluid contract because it changes public service semantics; the resulting decision aligned the research model with existing TypeScript behavior.

## Practices to Keep, Change, or Stop

- Keep isolated worktrees, narrow writable paths, contemporaneous reports, and implementation/report commits. Owner: coordinator.
- Change iteration startup to preflight branch refs and record actual kickoff commit in every report before implementation. Owner: coordination skill.
- Change dispatch to run independent workstreams concurrently after dependencies are satisfied. Owner: coordinator.
- Change delegated Cargo validation to print checkout identity and verify shared lockfiles immediately afterward. Owner: coordination skill and workstream agents.
- Stop treating summarized command output without exact counts or checkout identity as validation evidence. Owner: coordinator.

## Durable Lessons

Promoted: distinguish storage commitment from protocol acceptance; treat opaque position serialization as an implementation-owned optional operation; use conformance for wrappers; preserve deliberate duplication when comparing guarantees; and require checkout/lockfile validation in multi-worktree execution. These recur across storage, transport, wrappers, and agent coordination rather than one local implementation.

## Open Questions

- Can leader fencing alone guarantee one authoritative sequencer through failover, or is conditional append irreducible?
- How should ambiguous accepted appends be identified and recovered without unsafe resubmission?
- What framing distinguishes a torn tail from corrupted length metadata without overbuilding the durable log?
- Can snapshot publication and stream durability be coordinated without one transactional store?
- Can a network wrapper bridge finite catch-up to live delivery without gaps while preserving backpressure?
- Which position token stability guarantees are needed across reopen, restart, and transport versions?
