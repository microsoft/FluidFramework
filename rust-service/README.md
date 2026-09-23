# Sea

Sea, short for Snapshotted Event Archive, is an experimental Rust service for systems built from:

- opaque, totally ordered application events;
- immutable blob trees and snapshots at known event positions; and
- recovery by loading a snapshot and replaying later data.

Applications can use Sea locally or over WebTransport or the optional WebSocket transport, with a shared native and browser client implementation.
Storage is selectable between memory, buffered-file, and durable-file backends.
The Fluid driver is an application adapter, not a requirement for using Sea.

This is a speculative learning project, not a proposed production replacement for an existing Fluid service.

For the experiment's results, read the [project overview and measured results, September 2026](historical/PROJECT_OVERVIEW.md).
For how agents contributed, read [agentic development: method, outcomes, and limits](historical/AGENTIC_DEVELOPMENT.md).
Those are dated project records; the guides below describe the current code.

## Start Here

| Task | Guide |
| --- | --- |
| Set up, build, and test | [Development](DEVELOPMENT.md) |
| Try a local snapshot-and-replay example | [Sea counter](examples/sea-counter/README.md) |
| Run and configure the native server | [WebTransport server](crates/sea-webtransport-server/README.md) |
| Use the native or browser client | [WebTransport client](crates/sea-webtransport/README.md) |
| Use the Fluid driver or direct SharedTree integration | [TypeScript packages](packages/README.md) |
| Run Fluid and SharedTree integration tests | [Integration harness](tests/sea-integration-tests/README.md) |
| Run browser transport tests | [Browser harness](tests/webtransport-browser/README.md) |
| Measure performance | [Benchmark harness](crates/sea-benchmarks/README.md) and [collection scripts](scripts/README.md) |

## Understand the System

- [Sea architecture](SEA_ARCHITECTURE.md) explains the system layers, core traits, and ownership boundaries.
- [Ordered append and recovery](crates/sea-sequencer/README.md#ordered-append-and-recovery) defines accepted prefixes, terminal leave records, and client-owned resubmission; the same guide explains the required minimum-reference floor and current implementation gaps.
- [Workspace architecture](WORKSPACE_ARCHITECTURE.md) maps packages, dependencies, and runtime composition.
- [Crate guides](crates/README.md) link to implementation-specific guarantees, limitations, and validation commands.

[Sea at scale](SEA_AT_SCALE.md) proposes a multi-hop gateway and document-worker deployment, with Azure as one infrastructure example and a distinction between existing capabilities and new work.
It is an architectural proposal, not a current deployment guarantee.

The active [protocol simplification plan](NETWORK_PROTOCOL_PLAN.md) tracks initial metadata and framing changes and the required review of follow-up size optimizations.
It describes planned work, not current protocol guarantees.

The proposed [session resource policy plan](SESSION_RESOURCE_POLICY_PLAN.md) moves optional admission, pressure response, and reader shedding into service-owned session decorators rather than the sequencer.
It is an alternative design plan, not current behavior.

Past plans, learnings, iteration reports, decisions, and retained measurement evidence are collected in [Historical records](historical/README.md).
Current contributor requirements live in [Development](DEVELOPMENT.md).
Reusable agent workflows remain in the [coordination](../.github/skills/rust-service-coordination/SKILL.md), [quality-iteration](../.github/skills/rust-service-quality-iteration/SKILL.md), and [simplification-iteration](../.github/skills/rust-service-simplification-iteration/SKILL.md) skills.

## Limits

The native server is single-host, and uploaded content, events, and snapshots are retained without garbage collection.
The durable backend is designed for power-loss recovery on local filesystems with crash-atomic rename and reliable synchronization; qualification through power-cut testing remains outstanding.
See the [durable backend](crates/sea-file/README.md#power-loss-model) for assumptions and costs; it does not provide distributed durability.
Authentication, multi-tenant policy, cross-host fencing, replication, and production Fluid membership are not implemented.
See [known issues](KNOWN_ISSUES.md) for outstanding limitations and future work.
