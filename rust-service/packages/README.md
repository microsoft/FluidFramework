# Sea TypeScript Packages

These packages integrate the Sea service with Fluid and SharedTree.
They use the root pnpm workspace and Fluid build graph.

| Package | Purpose |
| --- | --- |
| [sea-driver](sea-driver/README.md) | Fluid document services and transport-neutral Sea client contracts, without a SharedTree dependency |
| [sea-tree](sea-tree/README.md) | Direct SharedTree integration without a Fluid container runtime |

All current exports are `@internal` and are available through each package's `/internal` entrypoint.
Neither package generates or initializes WebAssembly (WASM).
The [integration harness](../tests/minimal-fluid-driver/README.md) owns the generated-client adapter, WASM builds, browser setup, and cross-package tests.

`sea-tree` depends on `sea-driver` and SharedTree.
`sea-driver` must not depend on SharedTree or `sea-tree`, including through workspace development dependencies, so SharedTree can use the driver in its own tests without a dependency cycle.

See [development](../DEVELOPMENT.md) for workspace validation.