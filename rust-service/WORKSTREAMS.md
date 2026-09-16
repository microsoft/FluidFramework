# Workspace Architecture

This document records the current Rust workspace package graph.
Cargo manifests are authoritative when this summary and the workspace differ.

## Current Package Graph

The dependency column lists direct production dependencies on other workspace packages.
Development-only conformance fixtures and integration-test dependencies are described after the table.

| Package | Location | Direct workspace dependencies | Role |
| --- | --- | --- | --- |
| `sea-core` | `crates/sea-core/` | None | Events, positions, blob trees, snapshots, errors, `SeaStorage`, and `SeaSession`. |
| `sea-conformance` | `crates/sea-conformance/` | `sea-core` | Reusable storage and legacy stream semantic laws. |
| `sea-memory` | `crates/sea-memory/` | `sea-core` | In-process retain-all archive storage. |
| `sea-file` | `crates/sea-file/` | `sea-core` | Buffered single-process archive storage. |
| `sea-file-durable` | `crates/sea-file-durable/` | `sea-core` | Sync-before-acknowledgement archive storage with process-crash recovery. |
| `sea-content-addressed` | `crates/sea-content-addressed/` | `sea-core` | Reusable immutable blob and directory storage. |
| `sea-sequencer` | `crates/sea-sequencer/` | `sea-core` | Multi-user local `SeaSession`, stable operations, fencing, replay, and subscriptions. |
| `sea-webtransport` | `crates/sea-webtransport/` | `sea-core`; target-specific `sea-memory` and `sea-sequencer` for WASM local service | Sea v1 protocol, dispatch, native WebTransport, and generated browser/local/injected clients. |
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
	-> SeaStorage
	-> memory, buffered-file, or durable-file backend
```

The final native process is `sea-webtransport-server` and accepts Sea v1 sessions at `/sea`.
The generated WASM example in `sea-webtransport` provides `SeaLocalService`, `SeaLocalClient`, `SeaInjectedClient`, and `SeaBrowserTransport`.
