# Crates

This folder contains the Rust packages that implement the snapshotted append stream project.

- [`snapshotted-stream-core/`](snapshotted-stream-core/) defines the storage contracts and shared data types.
- [`snapshotted-stream-conformance/`](snapshotted-stream-conformance/) provides implementation-independent contract tests.
- [`snapshotted-stream-memory/`](snapshotted-stream-memory/), [`snapshotted-stream-file-simple/`](snapshotted-stream-file-simple/), and [`snapshotted-stream-content-addressed/`](snapshotted-stream-content-addressed/) provide storage implementations and content storage.
- [`fluid-service-protocol/`](fluid-service-protocol/), [`fluid-sequencer/`](fluid-sequencer/), and [`fluid-native-service/`](fluid-native-service/) implement the Fluid-facing protocol and native service.
- [`snapshotted-stream-client/`](snapshotted-stream-client/) provides the native Rust client facade.
- [`wrappers/`](wrappers/) contains transformation and transport adapters.
- [`snapshotted-stream-benchmarks/`](snapshotted-stream-benchmarks/) and [`spikes/`](spikes/) contain measurement tooling and explicitly experimental implementations.

Each package README describes its guarantees, limitations, and focused validation. Run the canonical workspace checks from [`../DEVELOPMENT.md`](../DEVELOPMENT.md) after cross-package changes.
