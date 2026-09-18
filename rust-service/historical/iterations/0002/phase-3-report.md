# Iteration 0002 Phase 3 Report

Status: complete
Phase 2 integration commit: `ea51fcf6a760672e4ed0c917e88276d4253705a9`
Phase 3 commit: final record commit containing this file; its hash becomes the next iteration source

## Evidence Summary

- Reference/model hypothesis supported: a fixed-seed public-trait model covered ordering, finite reads, generation scoping, snapshots, codec laws, interruption, and both legal ambiguous append outcomes without implementation-private hooks.
- Durable-snapshot hypothesis supported within its deterministic model: all incomplete final-frame prefixes were truncated, every byte corruption in complete log/snapshot frames was rejected, and injected publication failures recovered an old or new lineage member. Actual process termination and power loss remain untested.
- Network hypothesis supported locally: capacity-one queues remained bounded, readers stayed finite, reconnect was explicit, and snapshots, errors, positions, codec behavior, and compression ordering were preserved. The codec path uses a cloned local backend and is not a remote RPC design.
- Authoritative-sequencer hypothesis supported under one shared fence gate: invalid/stale operations never reached storage, reconnect used a fresh session and regenerated submission, and ambiguity/deduplication preserved stable identity without kernel conditional append.

## Implementation Defects

- Integrated conformance found durable snapshot regression classified as `Rejected` instead of the required `Conflict`; integration commit `4c50569f66d` corrected the local mapping and its focused test.
- The local network transport's typed in-process protocol and direct codec delegation cannot claim process isolation.
- The durable test injector models errors at operation boundaries, not abrupt termination, page-cache loss, or power loss.
- The included fence gate coordinates only instances sharing one process-local authority and cannot establish deployment failover safety.

## Shared Abstraction Findings

- Supported: the existing kernel contracts and optional codec compose across memory, file-simple, compression, durable storage, and bounded local transport. No shared API change was needed.
- Supported: service-layer validation, stable submission identity, replay, and exclusive fencing can provide valid-only Fluid storage without payload-aware kernel conditional append.
- Supported: direct application of a concurrently expanded conformance suite can reveal cross-workstream classification defects missed by specialized tests.
- Inconclusive: whether a deployment authority can preserve exclusivity through append across processes; whether process termination preserves the tested durable boundaries; and whether opaque tokens can support process-isolated transport without an asynchronous shared codec.
- Deferred: changing `PositionCodec`. The user chose to retain its synchronous optional API until process-isolated transport supplies a minimized counterexample.

## Decisions

- [Decision 0004](../../decisions/0004-authoritative-fluid-sequencer.md) remains accepted; iteration `0002` supports its service-layer validation and conditional-append deferral, subject to deployment fencing evidence.
- [Decision 0005](../../decisions/0005-opaque-position-codec.md) remains accepted. An asynchronous redesign is deferred, not rejected, pending process-isolated transport evidence.
- Foundation [Decisions 0001-0003](../../decisions/README.md) remain accepted and are not superseded. No new shared decision record is required this iteration.

## Comparative Results

- The seeded model passed direct and wrapped implementations; specialized durable and network suites added 15 and 9 tests before integration, while the authoritative service added 6 semantic tests.
- Durable framing stores 120 bytes per 64-byte payload record, or 1.875x amplification, and a 1,024-byte snapshot stores 1,145 bytes, about 1.118x. One uncontrolled debug reopen of 10,000 records took 11,146,498 ns; this is not a benchmark.
- The network compression-order case transported 76 payload bytes for 32,768 logical source bytes and observed a peak of one queued record at capacity one. Typed in-process protocol overhead was not byte encoded, so this is not comparable to a socket protocol.
- The authoritative sequencer retained only its existing direct dependencies. Its six traces are correctness evidence and provide no throughput or failover-latency claim.

## Learning and Process Findings

[The retrospective](retrospective.md) records repeated wrong-worktree validation routing, the value of parallel branch isolation, lockfile ownership constraints, and integrated conformance finding a local defect. Durable findings were promoted to [LEARNINGS.md](../../../LEARNINGS.md).

## Skill Changes

[The skill review](skill-review.md) confirms that iteration `0001`'s parallel dispatch, checkout markers, branch preflight, and lockfile rules were necessary and effective. It defers a new integration-conformance rule until another iteration establishes whether the manual adaptation pattern is stable; no skill file changes are applied in iteration `0002`.

## Next Iteration Scope

The user approved keeping all four iteration `0002` experiments and running three iteration `0003` workstreams concurrently:

1. `deployment-fencing`: prove or minimize a cross-process authority that remains exclusive through append.
2. `process-crash-recovery`: replace injected-error-only confidence with child-process termination and reopen evidence.
3. `process-isolated-transport`: test bounded framed IPC and opaque-token resume without local backend access.

The shared asynchronous codec redesign is deferred until the transport workstream demonstrates a concrete need. Encryption, browser storage, caching, retention, block compression, full Fluid drivers, and broad optimization remain deferred.

## Convergence Assessment

The generic kernel has converged provisionally: two iterations added implementations, wrappers, model tests, durability, transport, and authoritative sequencing without changing its accepted bytes, positions, finite readers, receipts, snapshots, or error taxonomy. The Fluid service boundary has not converged for deployment because its fencing proof is process-local. Durability has not converged beyond deterministic injection, and transport has not crossed a process boundary. Iteration `0003` targets exactly these three missing evidence classes before features or optimization broaden the surface.
