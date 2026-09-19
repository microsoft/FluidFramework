# Integration Tests

This folder contains cross-language and browser integration harnesses whose generated outputs remain ignored.

- [`minimal-fluid-driver/`](minimal-fluid-driver/) retains Fluid/SharedTree integration scenarios, browser traces, benchmarks, and aggregate package-test orchestration.
- [`wasm-client/`](wasm-client/) documents package-owned neutral Node WASM validation.
- [`webtransport-browser/`](webtransport-browser/) validates browser WebTransport against the native service with certificate pinning.

Follow each harness README for generation and execution commands. Validation must regenerate ignored consumers in the active checkout, execute the exact outputs, stop owned processes, and remove temporary artifacts afterward.

Focused driver, direct SharedTree, and neutral session regressions live in their [owning packages](../packages/README.md).
