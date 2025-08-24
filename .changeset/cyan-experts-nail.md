---
"@fluidframework/agent-scheduler": minor
"@fluidframework/ai-collab": minor
"@fluidframework/app-insights-logger": minor
"@fluidframework/aqueduct": minor
"@fluid-experimental/attributable-map": minor
"@fluid-experimental/attributor": minor
"@fluidframework/azure-client": minor
"@fluidframework/azure-end-to-end-tests": minor
"@fluidframework/azure-local-service": minor
"@fluidframework/azure-service-utils": minor
"@fluidframework/cell": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/core-utils": minor
"@fluidframework/counter": minor
"@fluid-experimental/data-object-base": minor
"@fluid-experimental/data-objects": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluid-experimental/dds-interceptions": minor
"@fluidframework/debugger": minor
"@fluidframework/devtools": minor
"@fluidframework/devtools-core": minor
"@fluidframework/driver-base": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/driver-utils": minor
"@fluidframework/driver-web-cache": minor
"@fluid-tools/fetch-tool": minor
"@fluidframework/file-driver": minor
"fluid-framework": minor
"@fluidframework/fluid-runner": minor
"@fluidframework/fluid-static": minor
"@fluidframework/fluid-telemetry": minor
"@fluidframework/id-compressor": minor
"@fluid-experimental/ink": minor
"@fluid-experimental/last-edited": minor
"@fluidframework/local-driver": minor
"@fluidframework/map": minor
"@fluidframework/matrix": minor
"@fluidframework/merge-tree": minor
"@fluidframework/odsp-client": minor
"@fluidframework/odsp-doclib-utils": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"@fluid-experimental/odsp-end-to-end-tests": minor
"@fluidframework/odsp-urlresolver": minor
"@fluid-experimental/oldest-client-observer": minor
"@fluidframework/ordered-collection": minor
"@fluid-experimental/ot": minor
"@fluid-experimental/pact-map": minor
"@fluidframework/presence": minor
"@fluid-experimental/property-changeset": minor
"@fluidframework/register-collection": minor
"@fluidframework/replay-driver": minor
"@fluidframework/request-handler": minor
"@fluidframework/routerlicious-driver": minor
"@fluidframework/routerlicious-urlresolver": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/sequence": minor
"@fluid-experimental/sequence-deprecated": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/shared-summary-block": minor
"@fluid-experimental/sharejs-json1": minor
"@fluid-private/stochastic-test-utils": minor
"@fluidframework/synthesize": minor
"@fluidframework/task-manager": minor
"@fluidframework/telemetry-utils": minor
"@fluid-private/test-dds-utils": minor
"@fluid-private/test-drivers": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluid-private/test-loader-utils": minor
"@fluid-private/test-pairwise-generator": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/test-utils": minor
"@fluid-private/test-version-utils": minor
"@fluidframework/tinylicious-client": minor
"@fluidframework/tinylicious-driver": minor
"@fluidframework/tool-utils": minor
"@fluid-experimental/tree": minor
"@fluidframework/tree": minor
"@fluid-experimental/tree-react-api": minor
"@fluidframework/undo-redo": minor
"__section": other
---
Build packages targeting ES2022

Packages are now built targeting ES2022.
This results in reduced bundle size (measured at 2% for SharedTree) and improved developer experience in debuggers due to JavaScript private fields being visible.

Fluid Framework has not officially supported targets older than ES2022 since before 2.0: this is documented in [ClientRequirements.md](https://github.com/microsoft/FluidFramework/blob/main/ClientRequirements.md) as well as the ReadMe for every client package.
This change does not involve any change to what is officially supported.
It is possible this change could impact users of less up to date JavaScript runtimes:
such users can use a tool like [babel](https://babeljs.io/) to transpile out unsupported language features.
