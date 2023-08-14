---
"@fluidframework/agent-scheduler": minor
"@fluidframework/aqueduct": minor
"@fluid-experimental/attributable-map": minor
"@fluid-experimental/azure-scenario-runner": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"@fluidframework/container-runtime-definitions": minor
"@fluidframework/container-utils": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/data-object-base": minor
"@fluid-experimental/data-objects": minor
"@fluidframework/datastore": minor
"@fluidframework/datastore-definitions": minor
"@fluid-experimental/devtools": minor
"@fluid-experimental/devtools-core": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/fluid-runner": minor
"@fluidframework/fluid-static": minor
"@fluid-experimental/last-edited": minor
"@fluidframework/map": minor
"@fluidframework/matrix": minor
"@fluidframework/merge-tree": minor
"@fluidframework/mocha-test-setup": minor
"@fluidframework/odsp-doclib-utils": minor
"@fluidframework/odsp-driver": minor
"@fluid-experimental/oldest-client-observer": minor
"@fluid-experimental/pact-map": minor
"@fluid-experimental/react-inputs": minor
"@fluidframework/replay-driver": minor
"@fluidframework/routerlicious-driver": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/sequence": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/task-manager": minor
"@fluidframework/telemetry-utils": minor
"@fluidframework/test-runtime-utils": minor
"@fluid-experimental/tree": minor
"@fluid-experimental/tree2": minor
---

Remove use of @fluidframework/common-definitions

The **@fluidframework/common-definitions** package is being deprecated, so the following interfaces and types are now
imported from the **@fluidframework/core-interfaces** package:

-   interface IDisposable
-   interface IErrorEvent
-   interface IErrorEvent
-   interface IEvent
-   interface IEventProvider
-   interface ILoggingError
-   interface ITaggedTelemetryPropertyType
-   interface ITelemetryBaseEvent
-   interface ITelemetryBaseLogger
-   interface ITelemetryErrorEvent
-   interface ITelemetryGenericEvent
-   interface ITelemetryLogger
-   interface ITelemetryPerformanceEvent
-   interface ITelemetryProperties
-   type ExtendEventProvider
-   type IEventThisPlaceHolder
-   type IEventTransformer
-   type ReplaceIEventThisPlaceHolder
-   type ReplaceIEventThisPlaceHolder
-   type TelemetryEventCategory
-   type TelemetryEventPropertyType
