# Iteration 0003 Phase 3 Report

Status: complete
Phase 2 integration commit: `247bd8db40ebc42c5fb24d354e843e5ed26f45b9`
Phase 3 commit: final record commit containing this file; its hash becomes the next iteration source

## Evidence Summary

- Deployment fencing was supported for cooperating processes on one host: the file authority held one stable inode lock through epoch validation, replay, protocol validation, and append; stale owners failed and process death released ownership.
- Process crash recovery was supported on the tested Linux/container filesystem: 17 child-process kill, abort, and exit cases recovered an acknowledged append prefix and only an old/new snapshot lineage member.
- Process-isolated transport was supported on Unix: a child-owned backend served bounded framed operations over Unix sockets, explicit reconnect resumed from opaque tokens, and shared codec conformance passed after adding a client-verifiable server-generation envelope.
- The full integrated workspace passed strict Clippy, build, 69 top-level tests with three intentional child entrypoints ignored, and the counter example.

## Implementation Defects

- Review found that the initial process client accepted arbitrary bounded and foreign-server position bytes synchronously. The workstream corrected this before integration with a checksummed server-generation envelope and direct codec conformance.
- The token correction was not canonically formatted; integration applied `cargo fmt` in `bab24992d7a` before the full gate.
- No remaining local defect is known in the accepted prototype scope.

## Shared Abstraction Findings

- Supported: the kernel and synchronous optional `PositionCodec` remained sufficient across real process boundaries without conditional append or an async codec API.
- Supported: valid-only sequencing can use service fencing when every writer shares an authority whose guard spans validation through append.
- Supported: abrupt process termination strengthened durable recovery evidence without changing persisted formats or shared APIs.
- Inconclusive outside scope: multi-host fencing, authority-file replacement, network filesystems, hardware power loss, Windows IPC, authentication, and traffic confidentiality.
- A transport-owned position envelope may validate framing and server generation synchronously while backend retention semantics remain asynchronous.

## Decisions

- [Decision 0006](../../decisions/0006-scoped-deployment-boundaries.md) accepts the tested same-host, process-termination, and Unix transport scopes without generalizing them.
- [Decision 0004](../../decisions/0004-authoritative-fluid-sequencer.md) remains accepted; deployment fencing supports its service-layer approach for the scoped target.
- [Decision 0005](../../decisions/0005-opaque-position-codec.md) remains accepted; process transport passed its conformance without an asynchronous API.
- Foundation [Decisions 0001-0003](../../decisions/README.md) remain accepted.

## Comparative Results

- Deployment fencing added no dependency and observed 5.12 ms handoff, 220 us post-crash reacquisition, and 6.58 ms for 16 guarded debug appends. Full-log replay makes these procedure observations, not capacity estimates.
- Process recovery added no dependency or format change. Seventeen child cases completed in the retained focused suites; hardware persistence was not measured.
- Process transport added no dependency, bounded readers to one queued record, and moved 187 framed bytes for 32,768 logical source bytes after compression. The local typed transport measured 76 bytes but excludes process framing, so only the queue bound is directly comparable.

## Learning and Process Findings

[The retrospective](retrospective.md) records the proposal-only first dispatch, repeated checkout-routing failures, the codec review correction, and successful process-boundary decomposition. General findings are promoted to [LEARNINGS.md](../../../LEARNINGS.md).

## Skill Changes

[The skill review](skill-review.md) retains checkout-marked validation and direct integration conformance. It records that implementation work must use a write-capable coding agent, but defers shared skill edits until the process-helper and conformance patterns stabilize.

## Next Iteration Scope

The user accepted same-host fencing and current process-crash evidence, and approved six iteration `0004` workstreams:

1. `service-assembly`: runnable native service and transport-neutral binary protocol.
2. `webtransport`: native server and native client plus browser-WASM client using the browser WebTransport API.
3. `native-client-lifecycle`: recovery, reconnect, pending submission, and explicit resubmission policy.
4. `benchmark-baseline`: reproducible startup, throughput, latency, memory, bandwidth, persistence, and recovery workloads.
5. `encryption-wrapper`: authenticated client-side payload/snapshot encryption with explicit nonce and key identity policy.
6. `stateful-compression`: block/stateful compression with snapshot-bound restart state and comparison against per-record compression.

Encryption and stateful compression are included because the kernel is stable enough for independent wrappers. Compression must precede encryption, and adaptive contexts must not mix secrets with attacker-controlled data. Encryption does not include key distribution or traffic-analysis protection.

Distributed fencing, hardware power-loss qualification, browser storage, caching, retention/GC, content-addressed blobs, a full Fluid driver, direct SharedTree integration, and platform-specific I/O optimization remain deferred.

## Convergence Assessment

The research kernel and process boundaries have converged for the accepted single-host prototype scope: three iterations added storage, wrappers, sequencing, crash recovery, and process transport without a justified kernel change. The project has not converged as a usable product because there is no assembled service, cross-platform network protocol, complete client lifecycle, security wrapper, stateful compression comparison, or reproducible benchmark baseline. Iteration `0004` shifts from kernel research toward those integration and product-surface questions.
