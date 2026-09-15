# Workspace Architecture

This document records the current Rust workspace package graph.
Cargo manifests are authoritative when this summary and the workspace differ.

## Current Package Graph

The dependency column lists direct production dependencies on other workspace packages.
Development-only conformance fixtures and integration-test dependencies are described after the table.

| Package | Location | Direct workspace dependencies | Role |
| --- | --- | --- | --- |
| `snapshotted-stream-core` | `crates/core/` | None | Storage-independent append, position, snapshot, capability, and error contracts. |
| `snapshotted-stream-conformance` | `crates/conformance/` | `snapshotted-stream-core` | Reusable semantic tests for stream implementations and transparent wrappers. |
| `snapshotted-stream-memory` | `crates/memory/` | `snapshotted-stream-core` | In-process reference storage. |
| `snapshotted-stream-file-simple` | `crates/file-simple/` | `snapshotted-stream-core` | Buffered single-process file storage. |
| `snapshotted-stream-durable-log-spike` | `crates/spikes/durable-log/` | `snapshotted-stream-core` | Research implementation for sync-before-acknowledgement and process-crash recovery. |
| `snapshotted-stream-content-addressed` | `crates/content-addressed/` | None | Immutable filesystem blobs and summary manifests. |
| `snapshotted-stream-compression` | `crates/wrappers/compression/` | `snapshotted-stream-core` | Transparent per-record compression. |
| `snapshotted-stream-encryption` | `crates/wrappers/encryption/` | `snapshotted-stream-core` | Transparent authenticated per-record encryption. |
| `snapshotted-stream-stateful-compression` | `crates/wrappers/stateful-compression/` | `snapshotted-stream-core` | Per-record compression with an immutable shared dictionary. |
| `snapshotted-stream-network` | `crates/wrappers/network/` | `snapshotted-stream-core` | In-process and Unix-process transports for the core contracts. |
| `fluid-service-protocol` | `crates/protocol/` | None | Transport-independent FSP4 request, response, framing, and limit definitions. |
| `fluid-sequencer` | `crates/fluid-sequencer/` | `snapshotted-stream-core` | Authoritative Fluid sessions, submissions, projection, ambiguity recovery, and fencing. |
| `fluid-native-service` | `crates/service/` | `fluid-sequencer`, `fluid-service-protocol`, `snapshotted-stream-content-addressed`, `snapshotted-stream-core`, `snapshotted-stream-durable-log-spike`, `snapshotted-stream-file-simple`, `snapshotted-stream-memory` | Single-host document, sequencing, storage, content, and subscription assembly. |
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
	-> selected append and snapshot implementation

fluid-native-service
	-> content-addressed blob and summary storage
```

The native service currently selects concrete storage implementations directly.
Storage transformations are independently composable through the core contracts but are not selectable through the native service.
These limitations are tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
