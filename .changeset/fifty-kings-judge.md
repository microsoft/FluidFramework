---
"@fluid-experimental/attributable-map": major
"@fluid-experimental/attributor": major
"@fluidframework/azure-client": major
"@fluidframework/azure-service-utils": major
"@fluidframework/cell": major
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
"@fluidframework/container-runtime-definitions": major
"@fluidframework/counter": major
"@fluidframework/datastore": major
"@fluidframework/datastore-definitions": major
"@fluidframework/debugger": major
"@fluid-experimental/devtools-core": major
"@fluidframework/driver-base": major
"@fluidframework/driver-definitions": major
"@fluidframework/driver-utils": major
"@fluid-tools/fetch-tool": major
"@fluidframework/file-driver": major
"@fluidframework/fluid-static": major
"@fluidframework/ink": major
"@fluid-experimental/last-edited": major
"@fluidframework/local-driver": major
"@fluidframework/map": major
"@fluidframework/matrix": major
"@fluidframework/merge-tree": major
"@fluidframework/odsp-driver": major
"@fluidframework/odsp-driver-definitions": major
"@fluid-experimental/oldest-client-observer": major
"@fluidframework/ordered-collection": major
"@fluid-experimental/ot": major
"@fluid-experimental/pact-map": major
"@fluid-experimental/property-dds": major
"@fluidframework/register-collection": major
"@fluidframework/replay-driver": major
"@fluidframework/routerlicious-driver": major
"@fluidframework/routerlicious-urlresolver": major
"@fluidframework/runtime-definitions": major
"@fluidframework/runtime-utils": major
"@fluidframework/sequence": major
"@fluidframework/shared-object-base": major
"@fluidframework/shared-summary-block": major
"@fluid-experimental/sharejs-json1": major
"@fluidframework/task-manager": major
"@fluidframework/telemetry-utils": major
"@fluidframework/test-driver-definitions": major
"@fluidframework/test-runtime-utils": major
"@fluidframework/test-utils": major
"@fluidframework/tinylicious-client": major
"@fluidframework/tinylicious-driver": major
"@fluidframework/tool-utils": major
"@fluid-experimental/tree": major
"@fluid-experimental/tree2": major
"@fluid-tools/webpack-fluid-loader": major
---

Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0

This included the following changes from the protocol-definitions release:

-   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
    submitted by clients to the server and the resulting signals sent from the server to clients.
    -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
        been added, which will be the typing for signals sent from the client to the server. Both extend a new
        ISignalMessageBase interface that contains common members.
-   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.
