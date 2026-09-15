# Wrappers

These packages compose transformations and transports around the core append-stream contracts.

- [`snapshotted-stream-compression/`](snapshotted-stream-compression/), [`snapshotted-stream-encryption/`](snapshotted-stream-encryption/), and [`snapshotted-stream-stateful-compression/`](snapshotted-stream-stateful-compression/) transform stored records and snapshots.
- [`snapshotted-stream-network/`](snapshotted-stream-network/) provides the process transport.
- [`fluid-webtransport-native/`](fluid-webtransport-native/) and [`fluid-webtransport-browser/`](fluid-webtransport-browser/) provide native-server and browser-WASM WebTransport adapters.
- [`fluid-native-service-browser/`](fluid-native-service-browser/) exposes the local native service to browser WASM consumers.

Composition order, framing, buffering, errors, and limitations differ by wrapper. Consult each package README before composing them, and run the canonical checks in [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) after shared changes.
