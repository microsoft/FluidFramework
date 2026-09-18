# Workspace Architecture

This document records the current Rust workspace package graph.
Cargo manifests are authoritative when this summary and the workspace differ.

## Current Package Graph

The dependency column lists direct production dependencies on other workspace packages.
Development-only conformance fixtures and integration-test dependencies are described after the table.

| Package | Location | Direct workspace dependencies | Role |
| --- | --- | --- | --- |
| `sea-core` | `crates/sea-core/` | None | Shared primitives, storage factories/components/`SeaView`, and sibling session contracts. |
| `sea-conformance` | `crates/sea-conformance/` | `sea-core` | Reusable view, snapshot-archive, and session semantic laws. |
| `sea-memory` | `crates/sea-memory/` | `sea-core` | In-process retain-all archive storage. |
| `sea-file` | `crates/sea-file/` | `sea-core` | Buffered single-process archive storage. |
| `sea-file-durable` | `crates/sea-file-durable/` | `sea-core`, `sea-file` | Synchronized configuration of the shared file engine with dependency-closed recovery. |
| `sea-content-addressed` | `crates/sea-content-addressed/` | `sea-core` | Reusable immutable blob and directory storage. |
| `sea-sequencer` | `crates/sea-sequencer/` | `sea-core` | Multi-user local `SeaSession`, stable operations, fencing, replay, and subscriptions. |
| `sea-webtransport` | `crates/sea-webtransport/` | `sea-core`; optional WASM `sea-memory` and `sea-sequencer` with `test-support` | Versioned Sea framing, native WebTransport, and generated browser/injected clients; local clients in test support. |
| `sea-webtransport-server` | `crates/sea-webtransport-server/` | `sea-core`, `sea-sequencer`, `sea-webtransport`, and all three storage backends | Native server executable and runtime backend composition. |
| `sea-compression` | `crates/sea-compression/` | `sea-core` | Transparent stateless compression `SeaSession` decorator. |
| `sea-encryption` | `crates/sea-encryption/` | `sea-core` | Transparent authenticated encryption `SeaSession` decorator. |
| `sea-stateful-compression` | `crates/sea-stateful-compression/` | `sea-core` | Immutable-dictionary compression `SeaSession` decorator. |
| `sea-benchmarks` | `crates/sea-benchmarks/` | Core, storage backends, and decorators | Local storage and transformation measurements. |
| `sea-counter` | `examples/sea-counter/` | `sea-core`, `sea-memory`, `sea-sequencer` | Snapshot and replay over a local session. |

Storage implementations and session decorators use `sea-conformance` as a development dependency where applicable.

At runtime, the primary service path is:

```text
application or Fluid adapter
	-> local, injected, native, or browser SeaSession client
	-> optional session decorators
	-> sea-sequencer
	-> SeaView over one exclusive document opening
	-> blob, event, and snapshot components from a SeaStorage factory
	-> memory, buffered-file, or durable-file backend
```

The final native process is `sea-webtransport-server` and accepts the current Sea protocol at `/sea`, without old-version negotiation.
The production WASM package provides `SeaInjectedClient` and `SeaBrowserTransport`; the separate generated test-support package additionally provides `SeaLocalService` and `SeaLocalClient`.
