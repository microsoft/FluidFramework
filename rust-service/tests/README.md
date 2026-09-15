# Integration Tests

This folder contains cross-language and browser integration harnesses whose generated outputs remain ignored.

- [`minimal-fluid-driver/`](minimal-fluid-driver/) adapts generated WASM clients to a minimal Fluid driver and SharedTree benchmark harness.
- [`wasm-client/`](wasm-client/) validates generated Node WASM bindings around an injected transport.
- [`webtransport-browser/`](webtransport-browser/) validates browser WebTransport against the native service with certificate pinning.

Follow each harness README for generation and execution commands. Validation must regenerate ignored consumers in the active checkout, execute the exact outputs, stop owned processes, and remove temporary artifacts afterward.
