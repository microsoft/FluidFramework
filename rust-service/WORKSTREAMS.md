# Workspace Architecture

This document records the current Rust workspace package graph.
Cargo manifests are authoritative when this summary and the workspace differ.

## Current Package Graph

The dependency column lists direct production dependencies on other workspace packages.
Development-only conformance fixtures and integration-test dependencies are described after the table.

| Package | Location | Direct workspace dependencies | Role |
| --- | --- | --- | --- |
| `snapshotted-stream-core` | `crates/core/` | None | Storage-independent append, position, snapshot, capability, error, and service storage composition contracts. |
| `snapshotted-stream-conformance` | `crates/conformance/` | `snapshotted-stream-core` | Reusable semantic tests for stream implementations and transparent wrappers. |
| `snapshotted-stream-memory` | `crates/memory/` | `snapshotted-stream-core` | In-process reference storage. |
| `snapshotted-stream-file-simple` | `crates/file-simple/` | `snapshotted-stream-core` | Buffered single-process file storage. |
| `snapshotted-stream-durable-log-spike` | `crates/spikes/durable-log/` | `snapshotted-stream-core` | Research implementation for sync-before-acknowledgement and process-crash recovery. |
| `snapshotted-stream-content-addressed` | `crates/content-addressed/` | `snapshotted-stream-core` | Immutable in-memory and filesystem blobs and summary manifests behind the common content contract. |
| `snapshotted-stream-compression` | `crates/wrappers/compression/` | `snapshotted-stream-core` | Transparent per-record compression. |
| `snapshotted-stream-encryption` | `crates/wrappers/encryption/` | `snapshotted-stream-core` | Transparent authenticated per-record encryption. |
| `snapshotted-stream-stateful-compression` | `crates/wrappers/stateful-compression/` | `snapshotted-stream-core` | Per-record compression with an immutable shared dictionary. |
| `snapshotted-stream-network` | `crates/wrappers/network/` | `snapshotted-stream-core` | In-process and Unix-process transports for the core contracts. |
| `fluid-service-protocol` | `crates/protocol/` | None | Transport-independent FSP4 request, response, framing, and limit definitions. |
| `fluid-sequencer` | `crates/fluid-sequencer/` | `snapshotted-stream-core` | Authoritative Fluid sessions, submissions, projection, ambiguity recovery, and fencing. |
| `fluid-service-storage` | `crates/storage/` | `snapshotted-stream-content-addressed`, `snapshotted-stream-core`, `snapshotted-stream-durable-log-spike`, `snapshotted-stream-file-simple`, `snapshotted-stream-memory` | Built-in backend selection, document factory, filesystem layout, content composition, and fencing policy. |
| `fluid-native-service` | `crates/service/` | `fluid-sequencer`, `fluid-service-protocol`, `fluid-service-storage`, `snapshotted-stream-core` | Single-host document, sequencing, content, and subscription behavior over injected storage. |
| `snapshotted-stream-client` | `crates/client/` | `fluid-service-protocol`, `snapshotted-stream-core` | Transport-independent client lifecycle, recovery policy, and content requests. |
| `fluid-webtransport-native` | `crates/wrappers/webtransport-native/` | `fluid-native-service`, `fluid-service-protocol` | Native WebTransport server and client adapter. |
| `fluid-webtransport-browser` | `crates/wrappers/webtransport-browser/` | `fluid-service-protocol` | Browser-WASM WebTransport client. |
| `fluid-native-service-browser` | `crates/wrappers/native-service-browser/` | `fluid-native-service`, `fluid-service-protocol` | Browser-WASM adapter for an in-process native service. |
| `snapshotted-stream-counter` | `examples/counter/` | `snapshotted-stream-client`, `snapshotted-stream-memory` | Snapshot and replay example. |
| `fluid-native-service-example` | `examples/native-service/` | `fluid-native-service`, `fluid-service-protocol` | Process-hosted native service example. |
| `snapshotted-stream-benchmarks` | `crates/benchmarks/` | Service, protocol, client, native WebTransport, storage implementations, and storage wrappers | Cross-layer workload and measurement harness. |

Storage implementations and transparent wrappers use `snapshotted-stream-conformance` as a development dependency.
Their focused tests use memory and wrapper compositions where needed.
The client uses `fluid-native-service` only for integration tests, not as a production dependency.

At runtime, the primary service path is:

```text
client or Fluid adapter
	-> FSP4 protocol
	-> native or browser transport
	-> fluid-native-service
	-> fluid-sequencer
	-> core document storage contract

fluid-native-service
	-> core content storage contract

fluid-service-storage
	-> selected document and content implementations
```

`NativeService::with_storage` accepts an external service storage composition.
`NativeService::new` remains a convenience constructor over `fluid-service-storage` and the built-in modes.
Storage transformations are independently composable through the core contracts but are not yet configured by the built-in composition.
That limitation is tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
