# Crates

This folder contains the Rust packages that implement the snapshotted append stream project.

- [`sea-core/`](sea-core/) defines the storage contracts and shared data types.
- [`sea-conformance/`](sea-conformance/) provides implementation-independent contract tests.
- [`sea-memory/`](sea-memory/), [`sea-file/`](sea-file/), and [`sea-content-addressed/`](sea-content-addressed/) provide storage implementations and content storage.
- [`sea-protocol/`](sea-protocol/), [`sea-sequencer/`](sea-sequencer/), and [`sea-service/`](sea-service/) implement the Fluid-facing protocol and native service.
- [`sea-client/`](sea-client/) provides the native Rust client facade.
- [`wrappers/`](wrappers/) contains transformation and transport adapters.
- [`sea-benchmarks/`](sea-benchmarks/) and [`spikes/`](spikes/) contain measurement tooling and explicitly experimental implementations.

Each package README describes its guarantees, limitations, and focused validation. Run the canonical workspace checks from [`../DEVELOPMENT.md`](../DEVELOPMENT.md) after cross-package changes.
