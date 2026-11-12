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
| `sea-integration-tests` | `crates/sea-integration-tests/` | None (test-only package) | Cross-crate composition of concrete sessions, decorators, and transports. |
| `sea-memory` | `crates/sea-memory/` | `sea-core` | In-process retain-all archive storage. |
| `sea-file` | `crates/sea-file/` | `sea-core` | Buffered and durable configurations of a shared file engine with dependency-closed recovery. |
| `sea-remote` | `crates/sea-remote/` | `sea-core` | Shared fenced-journal storage components, recovery, and live reads for optional remote providers. |
| `sea-postgres` | `crates/sea-postgres/` | `sea-core`, `sea-remote` | PostgreSQL storage with dedicated connections and session advisory locks. |
| `sea-azure` | `crates/sea-azure/` | `sea-core`, `sea-remote` | Azure/Azurite storage with leased append segments and fenced rollover. |
| `sea-content-addressed` | `crates/sea-content-addressed/` | `sea-core` | Reusable immutable blob and directory storage. |
| `sea-sequencer` | `crates/sea-sequencer/` | `sea-core` | Multi-user local `SeaSession`, stable event positions, accepted-prefix recovery, fencing, replay, and subscriptions. |
| `sea-signals` | `crates/sea-signals/` | `sea-core` | Bounded memory-only document messaging and live membership, independent of archive sequencing. |
| `sea-webtransport` | `crates/sea-webtransport/` | `sea-core` | Versioned Sea framing, shared session client, and native/browser transport primitives. |
| `sea-wasm` | `crates/sea-wasm/` | `sea-core`; optional `sea-memory`, `sea-sequencer`, `sea-signals`, `sea-webtransport`, and `sea-compression` | Shared session/signal bindings and feature-gated stack construction. |
| `sea-webtransport-server` | `crates/sea-webtransport-server/` | `sea-core`, `sea-file`, `sea-memory`, `sea-sequencer`, `sea-signals`, `sea-webtransport` | Native server executable, typed document hosting, and protocol adaptation. |
| `sea-compression` | `crates/sea-compression/` | `sea-core` | Transparent stateless compression `SeaSession` decorator. |
| `sea-encryption` | `crates/sea-encryption/` | `sea-core` | Transparent authenticated encryption `SeaSession` decorator. |
| `sea-benchmarks` | `crates/sea-benchmarks/` | `sea-compression`, `sea-core`, `sea-encryption`, `sea-file`, `sea-memory`, `sea-sequencer`, `sea-webtransport` | Storage, transformation, transport, and source-inventory measurements. |
| `sea-counter` | `examples/sea-counter/` | `sea-core`, `sea-memory`, `sea-sequencer` | Snapshot and replay over a local session. |

Storage implementations and session decorators use `sea-conformance` as a development dependency where applicable.
The PostgreSQL and Azure providers are opt-in library crates, not dependencies of the native server or WASM packages.
Their service tests require explicitly configured local or hosted services.
`sea-integration-tests` uses core, memory storage, the sequencer, payload decorators, and the WebTransport client and server as development dependencies.

At runtime, the primary service path is:

```text
application or Fluid adapter
	-> local, native, or browser SeaSession client
	-> optional session decorators
	-> sea-sequencer
	-> SeaView over one exclusive document opening
	-> blob, event, and snapshot components from a SeaStorage factory
	-> memory, buffered-file, or durable-file backend
```

The final native process is `sea-webtransport-server` and accepts the current Sea protocol at `/sea`, without old-version negotiation.
The `sea-typescript` package owns generated `sea-wasm` artifacts and exposes neutral local and remote factories.
The transport crate no longer generates JavaScript session or local test-service classes.
