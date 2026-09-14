# Wrappers

These packages compose transformations and transports around the core append-stream contracts.

- [`compression/`](compression/), [`encryption/`](encryption/), and [`stateful-compression/`](stateful-compression/) transform stored records and snapshots.
- [`network/`](network/) provides the process transport.
- [`webtransport-native/`](webtransport-native/) and [`webtransport-browser/`](webtransport-browser/) provide native-server and browser-WASM WebTransport adapters.
- [`native-service-browser/`](native-service-browser/) exposes the local native service to browser WASM consumers.

Composition order, framing, buffering, errors, and limitations differ by wrapper. Consult each package README before composing them, and run the canonical checks in [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) after shared changes.
