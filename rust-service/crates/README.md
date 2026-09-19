# Crates

This folder contains the Rust packages that implement Sea.

- [`sea-core/`](sea-core/) defines the storage contracts and shared data types.
- [`sea-conformance/`](sea-conformance/) provides implementation-independent contract tests.
- [`sea-integration-tests/`](sea-integration-tests/) tests cross-crate composition, including repeated session decorators and transport hops.
- [`sea-memory/`](sea-memory/), [`sea-file/`](sea-file/), and [`sea-file-durable/`](sea-file-durable/) implement archive storage; [`sea-content-addressed/`](sea-content-addressed/) provides reusable immutable blob-tree storage.
- [`sea-sequencer/`](sea-sequencer/) implements local multi-user sessions.
- [`sea-webtransport/`](sea-webtransport/) owns Sea v1 framing, dispatch, native transport, and generated browser/local/injected clients.
- [`sea-webtransport-server/`](sea-webtransport-server/) provides the sole native server executable.
- [`sea-compression/`](sea-compression/) and [`sea-encryption/`](sea-encryption/) decorate `SeaSession` values.
- [`sea-benchmarks/`](sea-benchmarks/) contains measurement tooling.

Each package README describes its guarantees, limitations, and focused validation. Run the canonical workspace checks from [`../DEVELOPMENT.md`](../DEVELOPMENT.md) after cross-package changes.
