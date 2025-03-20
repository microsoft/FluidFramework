# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

_These are the logical layers into which our packages are grouped.
The dependencies between layers are enforced by the layer-check command._

### Common-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/gitresources](/server/routerlicious/packages/gitresources) | &nbsp; |

### Core-Interfaces

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/core-interfaces](/packages/common/core-interfaces) | &nbsp; |

### Protocol-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/protocol-definitions](/common/lib/protocol-definitions) | &nbsp; |

### Driver-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/driver-definitions](/packages/common/driver-definitions)</br>- [@fluidframework/odsp-driver-definitions](/packages/drivers/odsp-driver-definitions) | - [Core-Interfaces](#Core-Interfaces)</br>&nbsp; |

### Container-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-definitions](/packages/common/container-definitions)</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions) |

### Common-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/common-utils](/common/lib/common-utils) | &nbsp; |

### Core-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/core-utils](/packages/common/core-utils) | &nbsp; |

### Client-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-internal/client-utils](/packages/common/client-utils)</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Core-Utils](#Core-Utils) |

### Protocol-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/protocol-base](/server/routerlicious/packages/protocol-base)</br>&nbsp;</br>&nbsp; | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils) |

### Telemetry-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/telemetry-utils](/packages/utils/telemetry-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils) |

### Driver-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/driver-utils](/packages/loader/driver-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils) |

### Other-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/odsp-doclib-utils](/packages/utils/odsp-doclib-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils) |

### Tool-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/tool-utils](/packages/utils/tool-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Driver-Definitions](#Driver-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils) |

### Driver

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/debugger](/packages/drivers/debugger)</br>- [@fluidframework/driver-base](/packages/drivers/driver-base)</br>- [@fluidframework/driver-web-cache](/packages/drivers/driver-web-cache)</br>- [@fluidframework/file-driver](/packages/drivers/file-driver)</br>- [@fluidframework/odsp-driver](/packages/drivers/odsp-driver)</br>- [@fluidframework/odsp-urlresolver](/packages/drivers/odsp-urlResolver)</br>- [@fluidframework/replay-driver](/packages/drivers/replay-driver) | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils) |

### Loader

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-loader](/packages/loader/container-loader)</br>- [@fluid-private/test-loader-utils](/packages/loader/test-loader-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils) |

### Runtime

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-experimental/attributable-map](/experimental/dds/attributable-map)</br>- [@fluid-experimental/ot](/experimental/dds/ot/ot)</br>- [@fluid-experimental/sharejs-json1](/experimental/dds/ot/sharejs/json1)</br>- [@fluid-experimental/sequence-deprecated](/experimental/dds/sequence-deprecated)</br>- [@fluid-experimental/tree](/experimental/dds/tree)</br>- [@fluidframework/cell](/packages/dds/cell)</br>- [@fluidframework/counter](/packages/dds/counter)</br>- [@fluid-experimental/ink](/packages/dds/ink)</br>- [@fluidframework/map](/packages/dds/map)</br>- [@fluidframework/matrix](/packages/dds/matrix)</br>- [@fluidframework/merge-tree](/packages/dds/merge-tree)</br>- [@fluidframework/ordered-collection](/packages/dds/ordered-collection)</br>- [@fluid-experimental/pact-map](/packages/dds/pact-map)</br>- [@fluidframework/register-collection](/packages/dds/register-collection)</br>- [@fluidframework/sequence](/packages/dds/sequence)</br>- [@fluidframework/shared-object-base](/packages/dds/shared-object-base)</br>- [@fluidframework/shared-summary-block](/packages/dds/shared-summary-block)</br>- [@fluidframework/task-manager](/packages/dds/task-manager)</br>- [@fluidframework/tree](/packages/dds/tree)</br>- [@fluidframework/container-runtime](/packages/runtime/container-runtime)</br>- [@fluidframework/container-runtime-definitions](/packages/runtime/container-runtime-definitions)</br>- [@fluidframework/datastore](/packages/runtime/datastore)</br>- [@fluidframework/datastore-definitions](/packages/runtime/datastore-definitions)</br>- [@fluidframework/id-compressor](/packages/runtime/id-compressor)</br>- [@fluidframework/runtime-definitions](/packages/runtime/runtime-definitions)</br>- [@fluidframework/runtime-utils](/packages/runtime/runtime-utils) | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Framework

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-experimental/data-objects](/experimental/framework/data-objects)</br>- [@fluidframework/fluid-static](/packages/framework/fluid-static)</br>- [@fluid-experimental/property-changeset](/experimental/PropertyDDS/packages/property-changeset)</br>- [@fluid-experimental/property-common](/experimental/PropertyDDS/packages/property-common)</br>- [@fluid-internal/platform-dependent](/experimental/PropertyDDS/packages/property-common/platform-dependent) (private)</br>- [@fluid-experimental/property-dds](/experimental/PropertyDDS/packages/property-dds)</br>- [@fluid-experimental/property-properties](/experimental/PropertyDDS/packages/property-properties)</br>- [@fluid-experimental/last-edited](/experimental/framework/last-edited)</br>- [@fluid-experimental/tree-react-api](/experimental/framework/tree-react-api)</br>- [@fluidframework/agent-scheduler](/packages/framework/agent-scheduler)</br>- [@fluidframework/ai-collab](/packages/framework/ai-collab)</br>- [@fluidframework/aqueduct](/packages/framework/aqueduct)</br>- [@fluid-experimental/attributor](/packages/framework/attributor)</br>- [@fluidframework/app-insights-logger](/packages/framework/client-logger/app-insights-logger)</br>- [@fluidframework/fluid-telemetry](/packages/framework/client-logger/fluid-telemetry)</br>- [@fluid-experimental/data-object-base](/packages/framework/data-object-base)</br>- [@fluid-experimental/dds-interceptions](/packages/framework/dds-interceptions)</br>- [@fluid-experimental/oldest-client-observer](/packages/framework/oldest-client-observer)</br>- [@fluidframework/presence](/packages/framework/presence)</br>- [@fluidframework/request-handler](/packages/framework/request-handler)</br>- [@fluidframework/synthesize](/packages/framework/synthesize)</br>- [@fluidframework/undo-redo](/packages/framework/undo-redo) | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Build

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/build-common](/common/build/build-common)</br>- [@fluidframework/eslint-config-fluid](/common/build/eslint-config-fluid)</br>- [@fluid-internal/eslint-plugin-fluid](/common/build/eslint-plugin-fluid)</br>- [@fluid-tools/benchmark](/tools/benchmark) | &nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### AzureClient

| Packages | Layer Dependencies |
| --- | --- |
|  |  |

### UberPackage

| Packages | Layer Dependencies |
| --- | --- |
| - [fluid-framework](/packages/framework/fluid-framework)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework) |

### Azure-Service-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/azure-service-utils](/azure/packages/azure-service-utils) | - [Driver-Definitions](#Driver-Definitions) |

### Server-Shared-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-services-client](/server/routerlicious/packages/services-client)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils)</br>- [Protocol-Utils](#Protocol-Utils) |

### Server-Libs

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-kafka-orderer](/server/routerlicious/packages/kafka-orderer)</br>- [@fluidframework/server-lambdas](/server/routerlicious/packages/lambdas)</br>- [@fluidframework/server-lambdas-driver](/server/routerlicious/packages/lambdas-driver)</br>- [@fluidframework/server-local-server](/server/routerlicious/packages/local-server)</br>- [@fluidframework/server-memory-orderer](/server/routerlicious/packages/memory-orderer)</br>- [@fluidframework/server-routerlicious-base](/server/routerlicious/packages/routerlicious-base)</br>- [@fluidframework/server-services](/server/routerlicious/packages/services)</br>- [@fluidframework/server-services-core](/server/routerlicious/packages/services-core)</br>- [@fluidframework/server-services-ordering-kafkanode](/server/routerlicious/packages/services-ordering-kafkanode)</br>- [@fluidframework/server-services-ordering-rdkafka](/server/routerlicious/packages/services-ordering-rdkafka)</br>- [@fluidframework/server-services-ordering-zookeeper](/server/routerlicious/packages/services-ordering-zookeeper)</br>- [@fluidframework/server-services-shared](/server/routerlicious/packages/services-shared)</br>- [@fluidframework/server-services-telemetry](/server/routerlicious/packages/services-telemetry)</br>- [@fluidframework/server-services-utils](/server/routerlicious/packages/services-utils)</br>- [@fluidframework/server-test-utils](/server/routerlicious/packages/test-utils) | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Server-Tools

| Packages | Layer Dependencies |
| --- | --- |
| - [tinylicious](/server/routerlicious/packages/tinylicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

### Azure-Service

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/azure-local-service](/azure/packages/azure-local-service) | - [Server-Tools](#Server-Tools) |

### GitRest

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/gitrest](/server/gitrest/packages/gitrest)</br>- [@fluidframework/gitrest-base](/server/gitrest/packages/gitrest-base)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

### Historian

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/historian](/server/historian/packages/historian)</br>- [@fluidframework/historian-base](/server/historian/packages/historian-base)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

### Routerlicious-Driver

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/routerlicious-driver](/packages/drivers/routerlicious-driver)</br>- [@fluidframework/routerlicious-urlresolver](/packages/drivers/routerlicious-urlResolver)</br>- [@fluidframework/tinylicious-driver](/packages/drivers/tinylicious-driver)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Server-Shared-Utils](#Server-Shared-Utils) |

### Test-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-private/stochastic-test-utils](/packages/test/stochastic-test-utils)</br>- [@fluid-private/test-dds-utils](/packages/dds/test-dds-utils)</br>- [@fluidframework/local-driver](/packages/drivers/local-driver)</br>- [@fluid-private/test-drivers](/packages/test/test-drivers)</br>- [@fluid-internal/test-driver-definitions](/packages/test/test-driver-definitions)</br>- [@fluid-private/test-pairwise-generator](/packages/test/test-pairwise-generator)</br>- [@fluidframework/test-runtime-utils](/packages/runtime/test-runtime-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Driver](#Driver)</br>- [Runtime](#Runtime)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver) |

### ServiceClients

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/azure-client](/packages/service-clients/azure-client)</br>- [@fluidframework/odsp-client](/packages/service-clients/odsp-client)</br>- [@fluidframework/tinylicious-client](/packages/service-clients/tinylicious-client)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Routerlicious-Driver](#Routerlicious-Driver) |

### Examples

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-example/ai-collab](/examples/apps/ai-collab) (private)</br>- [@fluid-example/attributable-map](/examples/apps/attributable-map) (private)</br>- [@fluid-example/collaborative-textarea](/examples/apps/collaborative-textarea) (private)</br>- [@fluid-example/contact-collection](/examples/apps/contact-collection) (private)</br>- [@fluid-example/data-object-grid](/examples/apps/data-object-grid) (private)</br>- [@fluid-example/presence-tracker](/examples/apps/presence-tracker) (private)</br>- [@fluid-example/staging](/examples/apps/staging) (private)</br>- [@fluid-example/task-selection](/examples/apps/task-selection) (private)</br>- [@fluid-example/tree-cli-app](/examples/apps/tree-cli-app) (private)</br>- [@fluid-example/tree-comparison](/examples/apps/tree-comparison) (private)</br>- [@fluid-example/bubblebench-baseline](/examples/benchmarks/bubblebench/baseline) (private)</br>- [@fluid-example/bubblebench-common](/examples/benchmarks/bubblebench/common) (private)</br>- [@fluid-example/bubblebench-experimental-tree](/examples/benchmarks/bubblebench/experimental-tree) (private)</br>- [@fluid-example/bubblebench-ot](/examples/benchmarks/bubblebench/ot) (private)</br>- [@fluid-example/bubblebench-shared-tree](/examples/benchmarks/bubblebench/shared-tree) (private)</br>- [@fluid-example/odspsnapshotfetch-perftestapp](/examples/benchmarks/odspsnapshotfetch-perftestapp) (private)</br>- [@fluid-internal/tablebench](/examples/benchmarks/tablebench) (private)</br>- [@fluid-example/app-insights-logger](/examples/client-logger/app-insights-logger) (private)</br>- [@fluid-example/canvas](/examples/data-objects/canvas) (private)</br>- [@fluid-example/clicker](/examples/data-objects/clicker) (private)</br>- [@fluid-example/codemirror](/examples/data-objects/codemirror) (private)</br>- [@fluid-example/diceroller](/examples/data-objects/diceroller) (private)</br>- [@fluid-example/inventory-app](/examples/data-objects/inventory-app) (private)</br>- [@fluid-example/monaco](/examples/data-objects/monaco) (private)</br>- [@fluid-example/multiview-constellation-model](/examples/data-objects/multiview/constellation-model) (private)</br>- [@fluid-example/multiview-constellation-view](/examples/data-objects/multiview/constellation-view) (private)</br>- [@fluid-example/multiview-container](/examples/data-objects/multiview/container) (private)</br>- [@fluid-example/multiview-coordinate-model](/examples/data-objects/multiview/coordinate-model) (private)</br>- [@fluid-example/multiview-coordinate-interface](/examples/data-objects/multiview/interface) (private)</br>- [@fluid-example/multiview-plot-coordinate-view](/examples/data-objects/multiview/plot-coordinate-view) (private)</br>- [@fluid-example/multiview-slider-coordinate-view](/examples/data-objects/multiview/slider-coordinate-view) (private)</br>- [@fluid-example/multiview-triangle-view](/examples/data-objects/multiview/triangle-view) (private)</br>- [@fluid-example/prosemirror](/examples/data-objects/prosemirror) (private)</br>- [@fluid-example/smde](/examples/data-objects/smde) (private)</br>- [@fluid-example/table-document](/examples/data-objects/table-document)</br>- [@fluid-example/todo](/examples/data-objects/todo) (private)</br>- [@fluid-example/webflow](/examples/data-objects/webflow) (private)</br>- [@fluid-example/app-integration-external-data](/examples/external-data) (private)</br>- [@fluid-example/shared-tree-demo](/examples/service-clients/odsp-client/shared-tree-demo) (private)</br>- [@fluid-example/bundle-size-tests](/examples/utils/bundle-size-tests) (private)</br>- [@fluid-example/example-utils](/examples/utils/example-utils) (private)</br>- [@fluid-example/import-testing](/examples/utils/import-testing) (private)</br>- [@fluid-example/migration-tools](/examples/utils/migration-tools) (private)</br>- [@fluid-example/webpack-fluid-loader](/examples/utils/webpack-fluid-loader) (private)</br>- [@fluid-example/app-integration-live-schema-upgrade](/examples/version-migration/live-schema-upgrade) (private)</br>- [@fluid-example/version-migration-same-container](/examples/version-migration/same-container) (private)</br>- [@fluid-example/version-migration-separate-container](/examples/version-migration/separate-container) (private)</br>- [@fluid-example/tree-shim](/examples/version-migration/tree-shim) (private)</br>- [@fluid-example/app-integration-container-views](/examples/view-integration/container-views) (private)</br>- [@fluid-example/app-integration-external-views](/examples/view-integration/external-views) (private)</br>- [@fluid-example/view-framework-sampler](/examples/view-integration/view-framework-sampler) (private) | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [UberPackage](#UberPackage)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Test-Utils](#Test-Utils)</br>- [ServiceClients](#ServiceClients)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Tools

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-private/changelog-generator-wrapper](/packages/tools/changelog-generator-wrapper) (private)</br>- [@fluidframework/devtools](/packages/tools/devtools/devtools)</br>- [@fluid-internal/devtools-browser-extension](/packages/tools/devtools/devtools-browser-extension) (private)</br>- [@fluidframework/devtools-core](/packages/tools/devtools/devtools-core)</br>- [@fluid-private/devtools-test-app](/packages/tools/devtools/devtools-test-app) (private)</br>- [@fluid-internal/devtools-view](/packages/tools/devtools/devtools-view) (private)</br>- [@fluid-tools/fetch-tool](/packages/tools/fetch-tool)</br>- [@fluidframework/fluid-runner](/packages/tools/fluid-runner)</br>- [@fluid-internal/replay-tool](/packages/tools/replay-tool) (private)</br>- [@fluid-tools/markdown-magic](/tools/markdown-magic) (private)</br>- [@fluid-tools/build-cli](/build-tools/packages/build-cli)</br>- [@fluid-tools/build-infrastructure](/build-tools/packages/build-infrastructure)</br>- [@fluidframework/build-tools](/build-tools/packages/build-tools)</br>- [@fluidframework/bundle-size-tools](/build-tools/packages/bundle-size-tools)</br>- [@fluid-tools/version-tools](/build-tools/packages/version-tools)</br>- [@fluid-tools/api-markdown-documenter](/tools/api-markdown-documenter)</br>- [@fluid-internal/getkeys](/tools/getkeys) (private)</br>- [@fluidframework/test-tools](/tools/test-tools) | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Test-Utils](#Test-Utils)</br>- [Examples](#Examples)</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Tests

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/azure-end-to-end-tests](/packages/service-clients/end-to-end-tests/azure-client)</br>- [@fluid-experimental/odsp-end-to-end-tests](/packages/service-clients/end-to-end-tests/odsp-client)</br>- [@fluid-internal/functional-tests](/packages/test/functional-tests) (private)</br>- [@fluid-internal/local-server-tests](/packages/test/local-server-tests) (private)</br>- [@fluid-internal/mocha-test-setup](/packages/test/mocha-test-setup)</br>- [@fluid-internal/test-snapshots](/packages/test/snapshots) (private)</br>- [@fluid-private/test-end-to-end-tests](/packages/test/test-end-to-end-tests)</br>- [@fluid-internal/test-service-load](/packages/test/test-service-load)</br>- [@fluidframework/test-utils](/packages/test/test-utils)</br>- [@fluid-private/test-version-utils](/packages/test/test-version-utils)</br>- [@types/jest-environment-puppeteer](/packages/test/types_jest-environment-puppeteer) (private)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Core-Interfaces](#Core-Interfaces)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Core-Utils](#Core-Utils)</br>- [Client-Utils](#Client-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Build](#Build)</br>- [Server-Libs](#Server-Libs)</br>- [Server-Tools](#Server-Tools)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Test-Utils](#Test-Utils)</br>- [ServiceClients](#ServiceClients)</br>- [Tools](#Tools) |

### Azure-Examples

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-example/app-integration-external-controller](/examples/service-clients/azure-client/external-controller) (private)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Telemetry-Utils](#Telemetry-Utils)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [UberPackage](#UberPackage)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [ServiceClients](#ServiceClients) |

### Routerlicious-Server

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-routerlicious](/server/routerlicious/packages/routerlicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Common-Definitions](#Common-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Common-Utils](#Common-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

