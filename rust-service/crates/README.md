# Crates

This folder contains the Rust packages that implement the snapshotted append stream project.

- [`core/`](core/) defines the storage contracts and shared data types.
- [`conformance/`](conformance/) provides implementation-independent contract tests.
- [`memory/`](memory/), [`file-simple/`](file-simple/), and [`content-addressed/`](content-addressed/) provide storage implementations and content storage.
- [`protocol/`](protocol/), [`fluid-sequencer/`](fluid-sequencer/), and [`service/`](service/) implement the Fluid-facing protocol and native service.
- [`client/`](client/) provides the native Rust client facade.
- [`wrappers/`](wrappers/) contains transformation and transport adapters.
- [`benchmarks/`](benchmarks/) and [`spikes/`](spikes/) contain measurement tooling and explicitly experimental implementations.

Each package README describes its guarantees, limitations, and focused validation. Run the canonical workspace checks from [`../DEVELOPMENT.md`](../DEVELOPMENT.md) after cross-package changes.
