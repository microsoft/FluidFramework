# Sea

Sea, short for Snapshotted Event Archive, is an experimental Rust service for systems built from:

- opaque, totally ordered application events;
- immutable blob trees and snapshots at known event positions; and
- recovery by loading a snapshot and replaying later data.

Applications can use Sea locally or over WebTransport, with a shared native and browser client implementation.
Storage is selectable between memory, buffered-file, and durable-file backends.
The Fluid driver is an application adapter, not a requirement for using Sea.

This is a speculative learning project, not a proposed production replacement for an existing Fluid service.

## Start Here

| Task | Guide |
| --- | --- |
| Set up, build, and test | [Development](DEVELOPMENT.md) |
| Try a local snapshot-and-replay example | [Sea counter](examples/sea-counter/README.md) |
| Run and configure the native server | [WebTransport server](crates/sea-webtransport-server/README.md) |
| Use the native or browser client | [WebTransport client](crates/sea-webtransport/README.md) |
| Use the Fluid driver or direct SharedTree integration | [TypeScript packages](packages/README.md) |
| Run Fluid and SharedTree integration tests | [Integration harness](tests/minimal-fluid-driver/README.md) |
| Run browser transport tests | [Browser harness](tests/webtransport-browser/README.md) |
| Measure performance | [Benchmarks](BENCHMARKS.md) |

## Understand the System

- [Sea architecture](SEA_ARCHITECTURE.md) explains the system layers, core traits, and ownership boundaries.
- [Ordered append and recovery](crates/sea-sequencer/README.md#ordered-append-and-recovery) defines accepted prefixes, terminal leave records, and client-owned resubmission; the same guide explains the required minimum-reference floor and current implementation gaps.
- [Workspace architecture](WORKSTREAMS.md) maps packages, dependencies, and runtime composition.
- [Crate guides](crates/README.md) link to implementation-specific guarantees, limitations, and validation commands.

Past plans, research notes, iteration reports, decisions, and benchmark evidence are collected in [Historical records](historical/README.md).

## Limits

The native server is single-host, and uploaded content, events, and snapshots are retained without garbage collection.
The durable backend demonstrates process-crash recovery, not power-loss or distributed durability.
Authentication, multi-tenant policy, cross-host fencing, replication, and production Fluid membership are not implemented.
See [known issues](KNOWN_ISSUES.md) for outstanding limitations and future work.
