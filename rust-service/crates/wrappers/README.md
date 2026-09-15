# Wrappers

These packages compose transformations and transports around the core append-stream contracts.

- [`sea-compression/`](../sea-compression/), [`sea-encryption/`](../sea-encryption/), and [`sea-stateful-compression/`](../sea-stateful-compression/) transform stored records and snapshots.
- [`sea-network/`](../sea-network/) provides the in-process transport.
- [`sea-webtransport/`](../sea-webtransport/) and [`sea-webtransport-browser/`](../sea-webtransport-browser/) provide native and browser-WASM WebTransport adapters.
- [`sea-service-browser/`](../sea-service-browser/) exposes the local native service to browser WASM consumers.

Composition order, framing, buffering, errors, and limitations differ by wrapper. Consult each package README before composing them, and run the canonical checks in [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) after shared changes.
