# Iteration 0007 Phase 3 Report

Status: complete
Phase 2 integration commit: `001b449f6fcc990298f551ab3a67cb3e3921f272`
Phase 3 commit: the commit containing this completed report; its self-referential hash is reported after creation

## Evidence Summary

Both charter questions were answered positively within the declared single-host scope. Fluid's default read connection received a remote edit, replaced itself with a write connection, submitted one edit exactly once, converged with the first view, recovered a disconnected-before-commit edit through explicit `notCommitted` resolution and one resubmission, and cold-replayed final value `3`. The native server stopped application acceptance, naturally drained owned sessions, cancelled sessions at immediate and bounded deadlines, propagated terminal stream errors, and reached zero active connections.

The evidence remained layered. Generated-WASM Node tests proved deterministic contract and out-of-order callback behavior. Native tests proved owned-future disposition. Chromium proved actual WebTransport, Fluid replacement, SharedTree convergence, and browser-observed shutdown behavior. No evidence is promoted to production membership, distributed deployment, power-loss, retention, or equivalent Routerlicious/ODSP behavior.

## Implementation Defects

- Removing the force-write gate alone exposed fresh replacement identity that was absent from the existing projected quorum.
- Reusing one synthetic member for external and future-local operations produced duplicate and non-increasing client sequence errors.
- Driver callback order was not Fluid client sequence order: reconnect no-op CSN 2 arrived before pending edit CSN 1. Contiguous buffering fixed the local ordering defect.
- Delta history and live delivery initially projected the same server sequence with different envelopes. Sharing memoized projection state fixed the duplicate-payload defect.
- The native marker controller initially awaited an acknowledgement without polling the server future that generated it. Polling both futures fixed the harness deadlock.
- A proposed Tokio signal feature required a forbidden lockfile update. Existing time/sync features plus marker control provided equivalent focused evidence.

## Shared Abstraction Findings

- Supported: a document-service-owned logical identity, session, cursor, last position, remote projection map, and submission queue can preserve Fluid's default read-to-write lifecycle without DDS decoding or hidden retry.
- Supported: projected history and live delivery must use one deterministic envelope function and one client-scoped sequence domain; server sequence equality alone is insufficient.
- Supported: a native accept loop can stop admission and drain or cancel every owned connection future without detached tasks or moving the non-`Send` fence guard.
- Falsified: transport connection identity can also serve as logical writer identity across read-to-write replacement.
- Falsified: callback arrival order is a valid substitute for Fluid client sequence order during reconnect.
- Inconclusive: production Fluid membership. FSP4 has no authoritative join/leave projection, and two concurrent read-first writers would share the synthetic local member.
- Inconclusive: graceful QUIC close as observed by browsers. The server can classify owned-future drain versus endpoint cancellation, but browser and `wtransport` APIs do not expose a portable peer close classification.

## Decisions

No accepted decision record changed. [Decision 0007](../../decisions/0007-projected-reads-and-ambiguity-recovery.md) still requires explicit ambiguity resolution, and [Decision 0008](../../decisions/0008-portable-wasm-client-boundary.md) still keeps transport behind generated WASM. A streaming protocol decision is deliberately deferred to iteration `0008`, where concrete framing and backpressure evidence can support it.

## Comparative Results

Correctness improved from a force-write exception to Fluid's default replacement lifecycle. The cost is document-service projection state and a contiguous submission queue; no new package or Rust dependency was added. Shutdown adds owned-future scheduling and an internal control handle with no lockfile change.

The integrated lifecycle trace used 3 sessions, 40,434 FSP4 bytes, a 4,157-byte peak response, 12 projected reads, and 2,078.5 ms. The three-run regression sample retained the old force-write benchmark path and measured median 13.45 ops/s, 58.2 ms median operation latency, and 113.9 ms median per-run p95. These figures are not a default-lifecycle or streaming comparison. The committed ten-run Rust/Tinylicious evidence remains provisional because Rust polls projected reads while Tinylicious receives pushed operations; no equivalent capacity claim is made.

Native shutdown measured 2-session natural drain in 1,147 ms, 2-session deadline cancellation in 143 ms, immediate cancellation in 89 ms, and browser deadline cancellation in 5,081 ms. Those are lifecycle bounds, not service throughput measurements.

## Learning and Process Findings

The [retrospective](retrospective.md) records four Fluid lifecycle falsifications, the delegated-work recovery, marker acknowledgement deadlock, lockfile-sensitive feature attempt, and Node engine mismatch. Durable architecture and agentic findings were promoted to [LEARNINGS.md](../../../LEARNINGS.md). The user approved the sequencing decision to finish reconnect and shutdown before streaming and supplied the practical Node 22 environment correction.

## Skill Changes

The [skill review](skill-review.md) accepts no skill-file change. Existing rules already require checkout identity, immediate validation, retained workstream reports, and lockfile checks. The browser lifecycle diagnostic procedure is now confirmed for reuse and promoted as a durable lesson rather than a new standalone skill.

## Next Iteration Scope

Keep the document-service lifecycle state, deterministic history/live projection, explicit ambiguity recovery, bounded native task ownership, and layered generated-WASM/native/Chromium evidence.

Replace request/response projected-read polling with one long-lived projected-operation subscription that atomically catches up and tails from an opaque cursor. Expand the contract to cover resume, gap and duplicate detection, bounded backpressure, cancellation, and graceful-shutdown disposition. Run this as one iteration `0008` workstream because it crosses protocol, native, browser WASM, and Fluid driver ownership: [live-projected-operation-streaming](next-phase-2-instructions/live-projected-operation-streaming.md).

After semantic equivalence passes, rerun the deterministic SharedTree benchmark with the Rust arm using default lifecycle and pushed operations. Compare against the committed pre-streaming Rust evidence and Tinylicious only with guarantee differences labeled. Do not require a predetermined speedup; require retained distributions and explanation of regressions.

Continue deferring production membership, submission batching, retention/GC, browser storage, distributed fencing, power-loss qualification, cloud storage, authentication, Node WebTransport, publication, offline merge, Routerlicious/ODSP compatibility, and broad optimization.

## Convergence Assessment

- Scoped iteration `0007` capabilities pass native, generated-WASM, TypeScript, workspace, and Chromium checks.
- Force-write and implicit native-future cancellation exceptions are removed and documented.
- No unresolved proposal changes kernel, sequencer, storage, or crate boundaries in this iteration.
- Reports distinguish synthetic membership and application-level stop-accepting from production claims.
- Correctness, FSP4 bytes, projected-read count, latency regression samples, and shutdown timing are measured with environment metadata.
- Missing convergence evidence is explicit: live push, atomic catch-up/tail, resumed subscriptions, backpressure, production membership, peer close classification, and an equivalent post-streaming benchmark.

The project has not reached final convergence. Iteration `0008` is justified by the polling asymmetry and provisional benchmark; broader optimization remains premature.
