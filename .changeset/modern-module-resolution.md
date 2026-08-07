---
"@fluid-experimental/oldest-client-observer": minor
"@fluidframework/agent-scheduler": minor
"@fluidframework/app-insights-logger": minor
"@fluidframework/aqueduct": minor
"@fluidframework/azure-client": minor
"@fluidframework/azure-service-utils": minor
"@fluidframework/cell": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/core-utils": minor
"@fluidframework/counter": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/debugger": minor
"@fluidframework/devtools": minor
"@fluidframework/devtools-core": minor
"@fluidframework/driver-base": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/driver-utils": minor
"@fluidframework/driver-web-cache": minor
"@fluidframework/file-driver": minor
"@fluidframework/fluid-runner": minor
"@fluidframework/fluid-static": minor
"@fluidframework/fluid-telemetry": minor
"@fluidframework/id-compressor": minor
"@fluidframework/legacy-dds": minor
"@fluidframework/local-driver": minor
"@fluidframework/map": minor
"@fluidframework/matrix": minor
"@fluidframework/merge-tree": minor
"@fluidframework/odsp-client": minor
"@fluidframework/odsp-doclib-utils": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"@fluidframework/odsp-urlresolver": minor
"@fluidframework/ordered-collection": minor
"@fluidframework/register-collection": minor
"@fluidframework/replay-driver": minor
"@fluidframework/request-handler": minor
"@fluidframework/routerlicious-driver": minor
"@fluidframework/routerlicious-urlresolver": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/sequence": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/shared-summary-block": minor
"@fluidframework/synthesize": minor
"@fluidframework/task-manager": minor
"@fluidframework/telemetry-utils": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/test-utils": minor
"@fluidframework/tinylicious-client": minor
"@fluidframework/tinylicious-driver": minor
"@fluidframework/tool-utils": minor
"@fluidframework/tree": minor
"@fluidframework/tree-agent": minor
"@fluidframework/tree-agent-langchain": minor
"@fluidframework/tree-agent-ses": minor
"@fluidframework/type-factory": minor
"@fluidframework/undo-redo": minor
"fluid-framework": minor
"__section": breaking
"__highlight": true
---
Require modern TypeScript module resolution

Fluid Framework Client packages no longer include type declaration compatibility entrypoints for TypeScript's legacy Node10 resolution mode (`"moduleResolution": "node"` or `"node10"`).
Applications upgrading to Fluid Framework 3.0 must use one of the following supported configurations:

- `"module": "Node16"` with `"moduleResolution": "Node16"`
- `"module": "NodeNext"` with `"moduleResolution": "NodeNext"`
- `"module": "ESNext"` with `"moduleResolution": "Bundler"`

The package entrypoints exposed through `package.json` exports, including `/alpha`, `/beta`, `/legacy`, and `/internal`, remain available under supported module resolution modes.

See [Removal of Node10 resolutions in v3.0](https://github.com/microsoft/FluidFramework/issues/27457) for more information.
