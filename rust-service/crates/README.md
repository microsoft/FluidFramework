# Crates

This folder contains the Rust packages that implement Sea.

- [`sea-core/`](sea-core/) defines the storage contracts and shared data types.
- [`sea-conformance/`](sea-conformance/) provides implementation-independent contract tests.
- [`sea-integration-tests/`](sea-integration-tests/) tests cross-crate composition, including repeated session decorators and transport hops.
- [`sea-memory/`](sea-memory/) and the buffered/durable modules in [`sea-file/`](sea-file/) implement archive storage; [`sea-content-addressed/`](sea-content-addressed/) provides reusable immutable blob-tree storage.
- [`sea-sequencer/`](sea-sequencer/) implements local multi-user sessions.
- [`sea-webtransport/`](sea-webtransport/) owns framing, dispatch, and native/browser transports.
- [`sea-wasm/`](sea-wasm/) exposes sessions to the [TypeScript packages](../packages/README.md).
- [`sea-signals/`](sea-signals/) provides ephemeral document-scoped messaging.
- [`sea-webtransport-server/`](sea-webtransport-server/) provides the sole native server executable.
- [`sea-compression/`](sea-compression/) and [`sea-encryption/`](sea-encryption/) decorate `SeaSession` values.
- [`sea-benchmarks/`](sea-benchmarks/) contains measurement tooling.

Each package README describes its guarantees, limitations, and focused validation. Run the canonical workspace checks from [`../DEVELOPMENT.md`](../DEVELOPMENT.md) after cross-package changes.
