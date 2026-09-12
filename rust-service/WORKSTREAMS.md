# Workstream Manifest

This manifest records the crate graph and proposed iteration `0001` ownership. The coordinator assigns one agent to each owner role when iteration records are initialized; until then, the coordinator owns changes to shared files.

## Crate Graph

```text
snapshotted-stream-core
├── snapshotted-stream-conformance (test specification)
├── snapshotted-stream-memory
├── snapshotted-stream-file-simple
├── snapshotted-stream-durable-log-spike
├── snapshotted-stream-compression
├── snapshotted-stream-client
│   └── snapshotted-stream-counter
└── fluid-sequencer
```

Implementation crates use `snapshotted-stream-conformance` only as a development dependency. The counter selects an implementation at the application edge; neither core nor client depends on memory, storage, wrappers, or Fluid semantics.

## Iteration 0001 Workstreams

| Workstream | Owner role | Writable paths | Dependencies | Expected evidence and deliverable |
| --- | --- | --- | --- | --- |
| `reference-conformance` | reference and conformance agent | `crates/memory/`, `crates/conformance/`, `crates/client/`, `examples/counter/` | core contract | Concurrent-reader/writer, cancellation, boundary, generation, and snapshot tests; counter recovers only through public traits; completed reference path. |
| `file-simple` | minimal file agent | `crates/file-simple/` | core and conformance | Restart test after clean close, explicit rejection of incomplete data, conformance results, persisted format notes, and no crash-durability claim. |
| `durable-log` | durable-log spike agent | `crates/spikes/durable-log/` | core and conformance | Prototype or minimized failing requirement covering opaque positions, receipt timing, tail recovery, and durability; document every guarantee not demonstrated. |
| `compression` | compression wrapper agent | `crates/wrappers/compression/` | core, conformance, then one reference implementation for integration tests | Transparent per-record compression, preservation of append boundaries and outer positions, conformance results, and size/throughput evidence. |
| `fluid-sequencer` | Fluid feasibility agent | `crates/fluid-sequencer/` | core contract; Fluid precedents in `PLAN.md` | Spike for final sequence metadata, writer-local order, reference positions, and minimum reference; minimized requirements for any missing conditional or service-side primitive. |

Shared edits to `Cargo.toml`, `crates/core/`, this manifest, or conformance semantics are coordinator-owned and follow the Phase 2 escalation process.

## Dependency Order

`reference-conformance`, `file-simple`, `durable-log`, and `fluid-sequencer` can begin from the iteration kickoff. `compression` may build its wrapper immediately but waits for the reference implementation's concurrent conformance additions before claiming compatibility. Counter integration depends on the reference path. No workstream depends on another storage spike.

## Composition Matrix

| Composition | Iteration | Required check |
| --- | --- | --- |
| counter framing -> raw client -> memory | foundation | Snapshot and replay example plus shared conformance. |
| counter framing -> per-record compression -> memory | `0001` | Integration test proving transparent recovery and append-boundary preservation. |
| framing -> compression -> transport -> persistence | deferred | Network workstream must preserve backpressure and stale-position detection. |
| framing -> compression -> authenticated encryption -> transport -> persistence | deferred | Encryption workstream must define nonce/key behavior and prove wrapper ordering. Compression precedes encryption. |

Caching, block/stateful compression, browser storage, full networking, encryption, and complete Fluid integration are explicitly deferred.
