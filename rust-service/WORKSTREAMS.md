# Workspace Architecture

This document records the current Rust workspace package graph.
Cargo manifests are authoritative when this summary and the workspace differ.

## Current Package Graph

The dependency column lists direct production dependencies on other workspace packages.
Development-only conformance fixtures and integration-test dependencies are described after the table.

| Package | Location | Direct workspace dependencies | Role |
| --- | --- | --- | --- |
| `sea-core` | `crates/sea-core/` | None | Storage-independent append, position, snapshot, capability, error, and service storage composition contracts. |
| `sea-conformance` | `crates/sea-conformance/` | `sea-core` | Reusable semantic tests for stream implementations and transparent wrappers. |
| `sea-memory` | `crates/sea-memory/` | `sea-core` | In-process reference storage. |
| `sea-file` | `crates/sea-file/` | `sea-core` | Buffered single-process file storage. |
| `sea-file-durable` | `crates/spikes/sea-file-durable/` | `sea-core` | Research implementation for sync-before-acknowledgement and process-crash recovery. |
| `sea-content-addressed` | `crates/sea-content-addressed/` | `sea-core` | Immutable in-memory and filesystem blobs and summary manifests behind the common content contract. |
| `sea-compression` | `crates/wrappers/sea-compression/` | `sea-core` | Transparent per-record compression. |
| `sea-encryption` | `crates/wrappers/sea-encryption/` | `sea-core` | Transparent authenticated per-record encryption. |
| `sea-stateful-compression` | `crates/wrappers/sea-stateful-compression/` | `sea-core` | Per-record compression with an immutable shared dictionary. |
| `sea-network` | `crates/wrappers/sea-network/` | `sea-core` | In-process and Unix-process transports for the core contracts. |
| `sea-protocol` | `crates/sea-protocol/` | None | Transport-independent FSP4 request, response, framing, and limit definitions. |
| `sea-sequencer` | `crates/sea-sequencer/` | `sea-core` | Authoritative Fluid sessions, submissions, projection, ambiguity recovery, and fencing. |
| `sea-storage` | `crates/sea-storage/` | `sea-content-addressed`, `sea-core`, `sea-file-durable`, `sea-file`, `sea-memory` | Built-in backend selection, document factory, filesystem layout, content composition, and fencing policy. |
| `sea-service` | `crates/sea-service/` | `sea-sequencer`, `sea-protocol`, `sea-storage`, `sea-core` | Single-host document, sequencing, content, and subscription behavior over injected storage. |
| `sea-client` | `crates/sea-client/` | `sea-protocol`, `sea-core` | Transport-independent client lifecycle, recovery policy, and content requests. |
| `sea-webtransport` | `crates/wrappers/sea-webtransport/` | `sea-service`, `sea-protocol` | Native WebTransport server and client adapter. |
| `sea-webtransport-browser` | `crates/wrappers/sea-webtransport-browser/` | `sea-protocol` | Browser-WASM WebTransport client. |
| `sea-service-browser` | `crates/wrappers/sea-service-browser/` | `sea-service`, `sea-protocol` | Browser-WASM adapter for an in-process native service. |
| `sea-counter` | `examples/sea-counter/` | `sea-client`, `sea-memory` | Snapshot and replay example. |
| `fluid-native-service-example` | `examples/fluid-native-service-example/` | `sea-service`, `sea-protocol` | Process-hosted native service example. |
| `sea-benchmarks` | `crates/sea-benchmarks/` | Service, protocol, client, native WebTransport, storage implementations, and storage wrappers | Cross-layer workload and measurement harness. |

Storage implementations and transparent wrappers use `sea-conformance` as a development dependency.
Their focused tests use memory and wrapper compositions where needed.
The client uses `sea-service` only for integration tests, not as a production dependency.

At runtime, the primary service path is:

```text
client or Fluid adapter
	-> FSP4 protocol
	-> native or browser transport
	-> sea-service
	-> sea-sequencer
	-> core document storage contract

sea-service
	-> core content storage contract

sea-storage
	-> selected document and content implementations
```

`NativeService::with_storage` accepts an external service storage composition.
`NativeService::new` remains a convenience constructor over `sea-storage` and the built-in modes.
Storage transformations are independently composable through the core contracts but are not yet configured by the built-in composition.
That limitation is tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
