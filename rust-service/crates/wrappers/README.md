# Wrappers

The packages formerly grouped here now live directly under `crates/`.

- [`sea-compression/`](../sea-compression/), [`sea-encryption/`](../sea-encryption/), and [`sea-stateful-compression/`](../sea-stateful-compression/) decorate `SeaSession` values.
- [`sea-webtransport/`](../sea-webtransport/) provides native WebTransport plus generated browser, local, and injected clients.

This directory remains only as a historical grouping-document location.

All three transforming wrappers implement replacement archive, author, and snapshot-coordinator facets directly on their existing session types.
They preserve underlying availability handles, stored identity references, progress, and classified errors; no old-storage adapter is involved.
For authenticated compression, place compression outside encryption.
The dictionary wrapper's localized integration test runs that composition through buffered and durable replacement file storage, sequencer recovery, snapshots, and replay.
