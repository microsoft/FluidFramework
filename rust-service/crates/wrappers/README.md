# Wrappers

The packages formerly grouped here now live directly under `crates/`.

- [`sea-compression/`](../sea-compression/) and [`sea-encryption/`](../sea-encryption/) decorate `SeaSession` values.
- [`sea-webtransport/`](../sea-webtransport/) provides native WebTransport plus generated browser, local, and injected clients.

This directory remains only as a historical grouping-document location.

Both transforming wrappers implement replacement archive, author, and snapshot-coordinator facets directly on their existing session types.
They preserve underlying availability handles, stored identity references, progress, and classified errors; no old-storage adapter is involved.
For authenticated compression, place compression outside encryption.
