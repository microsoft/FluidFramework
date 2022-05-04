# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

_These are the logical layers into which our packages are grouped.
The dependencies between layers are enforced by the layer-check command._

### Base-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/common-definitions](/common/lib/common-definitions)</br>- [@fluidframework/core-interfaces](/common/lib/core-interfaces)</br>- [@fluidframework/gitresources](/server/routerlicious/packages/gitresources) | &nbsp;</br>&nbsp;</br>&nbsp; |

### Protocol-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/protocol-definitions](/common/lib/protocol-definitions) | - [Base-Definitions](#Base-Definitions) |

### Driver-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/driver-definitions](/common/lib/driver-definitions)</br>- [@fluidframework/odsp-driver-definitions](/packages/drivers/odsp-driver-definitions) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions) |

### Container-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-definitions](/common/lib/container-definitions)</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions) |

### Base-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/common-utils](/common/lib/common-utils) | - [Base-Definitions](#Base-Definitions) |

### Protocol-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/protocol-base](/server/routerlicious/packages/protocol-base)</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils) |

### Framework-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/view-adapters](/packages/framework/view-adapters)</br>- [@fluidframework/view-interfaces](/packages/framework/view-interfaces) | - [Base-Definitions](#Base-Definitions)</br>&nbsp; |

### Telemetry-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/telemetry-utils](/packages/utils/telemetry-utils)</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Base-Utils](#Base-Utils) |

### Driver-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/driver-utils](/packages/loader/driver-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils) |

### Other-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/odsp-doclib-utils](/packages/utils/odsp-doclib-utils)</br>- [@fluidframework/azure-service-utils](/packages/framework/azure-service-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils) |

### Tool-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/tool-utils](/packages/utils/tool-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Other-Utils](#Other-Utils) |

### Container-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-utils](/packages/loader/container-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils) |

### Driver

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/debugger](/packages/drivers/debugger)</br>- [@fluidframework/driver-base](/packages/drivers/driver-base)</br>- [@fluidframework/driver-web-cache](/packages/drivers/driver-web-cache)</br>- [@fluidframework/file-driver](/packages/drivers/file-driver)</br>- [@fluid-tools/fluidapp-odsp-urlresolver](/packages/drivers/fluidapp-odsp-urlResolver)</br>- [@fluidframework/iframe-driver](/packages/drivers/iframe-driver)</br>- [@fluidframework/odsp-driver](/packages/drivers/odsp-driver)</br>- [@fluidframework/odsp-urlresolver](/packages/drivers/odsp-urlResolver)</br>- [@fluidframework/replay-driver](/packages/drivers/replay-driver)</br>- [@fluidframework/routerlicious-host](/packages/drivers/routerlicious-host) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>&nbsp;</br>&nbsp; |

### Loader

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-loader](/packages/loader/container-loader)</br>- [@fluidframework/test-loader-utils](/packages/loader/test-loader-utils)</br>- [@fluidframework/web-code-loader](/packages/loader/web-code-loader)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils) |

### Runtime

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-experimental/ot](/experimental/dds/ot/ot)</br>- [@fluid-experimental/sharejs-json1](/experimental/dds/ot/sharejs/json1)</br>- [@fluid-experimental/tree](/experimental/dds/tree)</br>- [@fluid-experimental/tree-graphql](/experimental/dds/tree-graphql)</br>- [@fluid-experimental/xtree](/experimental/dds/xtree)</br>- [@fluidframework/cell](/packages/dds/cell)</br>- [@fluidframework/counter](/packages/dds/counter)</br>- [@fluidframework/ink](/packages/dds/ink)</br>- [@fluidframework/map](/packages/dds/map)</br>- [@fluidframework/matrix](/packages/dds/matrix)</br>- [@fluidframework/merge-tree](/packages/dds/merge-tree)</br>- [@fluidframework/ordered-collection](/packages/dds/ordered-collection)</br>- [@fluidframework/register-collection](/packages/dds/register-collection)</br>- [@fluidframework/sequence](/packages/dds/sequence)</br>- [@fluidframework/shared-object-base](/packages/dds/shared-object-base)</br>- [@fluidframework/shared-summary-block](/packages/dds/shared-summary-block)</br>- [@fluid-experimental/task-manager](/packages/dds/task-manager)</br>- [@fluid-internal/tree](/packages/dds/tree) (private)</br>- [@fluidframework/agent-scheduler](/packages/runtime/agent-scheduler)</br>- [@fluidframework/container-runtime](/packages/runtime/container-runtime)</br>- [@fluidframework/container-runtime-definitions](/packages/runtime/container-runtime-definitions)</br>- [@fluidframework/datastore](/packages/runtime/datastore)</br>- [@fluidframework/datastore-definitions](/packages/runtime/datastore-definitions)</br>- [@fluidframework/garbage-collector](/packages/runtime/garbage-collector)</br>- [@fluidframework/runtime-definitions](/packages/runtime/runtime-definitions)</br>- [@fluidframework/runtime-utils](/packages/runtime/runtime-utils) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Framework

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-experimental/data-objects](/experimental/framework/data-objects)</br>- [@fluidframework/fluid-static](/packages/framework/fluid-static)</br>- [@fluid-experimental/property-binder](/experimental/PropertyDDS/packages/property-binder)</br>- [@fluid-experimental/property-changeset](/experimental/PropertyDDS/packages/property-changeset)</br>- [@fluid-experimental/property-common](/experimental/PropertyDDS/packages/property-common)</br>- [@fluid-experimental/property-dds](/experimental/PropertyDDS/packages/property-dds)</br>- [@fluid-experimental/property-inspector-table](/experimental/PropertyDDS/packages/property-inspector-table)</br>- [@fluid-experimental/property-properties](/experimental/PropertyDDS/packages/property-properties)</br>- [@fluid-experimental/property-proxy](/experimental/PropertyDDS/packages/property-proxy)</br>- [@fluid-experimental/property-query](/experimental/PropertyDDS/packages/property-query)</br>- [@fluid-experimental/last-edited](/experimental/framework/last-edited)</br>- [@fluid-experimental/react-inputs](/experimental/framework/react-inputs)</br>- [@fluidframework/aqueduct](/packages/framework/aqueduct)</br>- [@fluidframework/data-object-base](/packages/framework/data-object-base)</br>- [@fluidframework/dds-interceptions](/packages/framework/dds-interceptions)</br>- [@fluidframework/request-handler](/packages/framework/request-handler)</br>- [@fluidframework/synthesize](/packages/framework/synthesize)</br>- [@fluidframework/undo-redo](/packages/framework/undo-redo) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### UberPackage

| Packages | Layer Dependencies |
| --- | --- |
| - [fluid-framework](/packages/framework/fluid-framework)</br>&nbsp;</br>&nbsp; | - [Container-Definitions](#Container-Definitions)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework) |

### Build

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/build-common](/common/build/build-common)</br>- [@fluidframework/eslint-config-fluid](/common/build/eslint-config-fluid)</br>- [@fluid-tools/benchmark](/tools/benchmark) | &nbsp;</br>&nbsp;</br>&nbsp; |

### Server-Shared-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-services-client](/server/routerlicious/packages/services-client)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils) |

### Server-Libs

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-kafka-orderer](/server/routerlicious/packages/kafka-orderer)</br>- [@fluidframework/server-lambdas](/server/routerlicious/packages/lambdas)</br>- [@fluidframework/server-lambdas-driver](/server/routerlicious/packages/lambdas-driver)</br>- [@fluidframework/server-local-server](/server/routerlicious/packages/local-server)</br>- [@fluidframework/server-memory-orderer](/server/routerlicious/packages/memory-orderer)</br>- [@fluidframework/server-routerlicious-base](/server/routerlicious/packages/routerlicious-base)</br>- [@fluidframework/server-services](/server/routerlicious/packages/services)</br>- [@fluidframework/server-services-core](/server/routerlicious/packages/services-core)</br>- [@fluidframework/server-services-ordering-kafkanode](/server/routerlicious/packages/services-ordering-kafkanode)</br>- [@fluidframework/server-services-ordering-rdkafka](/server/routerlicious/packages/services-ordering-rdkafka)</br>- [@fluidframework/server-services-ordering-zookeeper](/server/routerlicious/packages/services-ordering-zookeeper)</br>- [@fluidframework/server-services-shared](/server/routerlicious/packages/services-shared)</br>- [@fluidframework/server-services-telemetry](/server/routerlicious/packages/services-telemetry)</br>- [@fluidframework/server-services-utils](/server/routerlicious/packages/services-utils)</br>- [@fluidframework/server-test-utils](/server/routerlicious/packages/test-utils) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Server-Tools

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/azure-local-service](/server/azure-local-service)</br>- [tinylicious](/server/tinylicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

### Routerlicious-Driver

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/routerlicious-driver](/packages/drivers/routerlicious-driver)</br>- [@fluidframework/routerlicious-urlresolver](/packages/drivers/routerlicious-urlResolver)</br>- [@fluidframework/tinylicious-driver](/packages/drivers/tinylicious-driver)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Server-Shared-Utils](#Server-Shared-Utils) |

### ServiceClients

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/azure-client](/packages/framework/azure-client)</br>- [@fluidframework/tinylicious-client](/packages/framework/tinylicious-client)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Routerlicious-Driver](#Routerlicious-Driver) |

### Test-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-internal/test-dds-utils](/packages/dds/test-dds-utils) (private)</br>- [@fluidframework/local-driver](/packages/drivers/local-driver)</br>- [@fluidframework/test-client-utils](/packages/framework/test-client-utils)</br>- [@fluidframework/test-runtime-utils](/packages/runtime/test-runtime-utils)</br>- [@fluid-tools/webpack-fluid-loader](/packages/tools/webpack-fluid-loader)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver) |

### HostUtils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-experimental/get-container](/experimental/framework/get-container)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Driver-Utils](#Driver-Utils)</br>- [Loader](#Loader)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Test-Utils](#Test-Utils) |

### Examples

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-example/collaborative-textarea](/examples/apps/collaborative-textarea)</br>- [@fluid-example/contact-collection](/examples/apps/contact-collection)</br>- [@fluid-example/likes](/examples/apps/likes)</br>- [@fluid-example/spaces](/examples/apps/spaces)</br>- [@fluid-example/view-framework-sampler](/examples/apps/view-framework-sampler)</br>- [@fluid-example/badge](/examples/data-objects/badge)</br>- [@fluid-example/canvas](/examples/data-objects/canvas)</br>- [@fluid-example/clicker](/examples/data-objects/clicker)</br>- [@fluid-example/clicker-context](/examples/data-objects/clicker-react/clicker-context)</br>- [@fluid-example/clicker-function](/examples/data-objects/clicker-react/clicker-function)</br>- [@fluid-example/clicker-react](/examples/data-objects/clicker-react/clicker-react)</br>- [@fluid-example/clicker-reducer](/examples/data-objects/clicker-react/clicker-reducer)</br>- [@fluid-example/clicker-with-hook](/examples/data-objects/clicker-react/clicker-with-hook)</br>- [@fluid-example/client-ui-lib](/examples/data-objects/client-ui-lib)</br>- [@fluid-example/codemirror](/examples/data-objects/codemirror)</br>- [@fluid-example/diceroller](/examples/data-objects/diceroller)</br>- [@fluid-example/focus-tracker](/examples/data-objects/focus-tracker)</br>- [@fluid-example/image-gallery](/examples/data-objects/image-gallery)</br>- [@fluid-example/key-value-cache](/examples/data-objects/key-value-cache)</br>- [@fluid-example/monaco](/examples/data-objects/monaco)</br>- [@fluid-example/multiview-constellation-model](/examples/data-objects/multiview/constellation-model)</br>- [@fluid-example/multiview-constellation-view](/examples/data-objects/multiview/constellation-view)</br>- [@fluid-example/multiview-container](/examples/data-objects/multiview/container)</br>- [@fluid-example/multiview-coordinate-model](/examples/data-objects/multiview/coordinate-model)</br>- [@fluid-example/multiview-coordinate-interface](/examples/data-objects/multiview/interface)</br>- [@fluid-example/multiview-plot-coordinate-view](/examples/data-objects/multiview/plot-coordinate-view)</br>- [@fluid-example/multiview-slider-coordinate-view](/examples/data-objects/multiview/slider-coordinate-view)</br>- [@fluid-example/multiview-triangle-view](/examples/data-objects/multiview/triangle-view)</br>- [@fluid-example/musica](/examples/data-objects/musica)</br>- [@fluid-example/pond](/examples/data-objects/pond)</br>- [@fluid-example/primitives](/examples/data-objects/primitives)</br>- [@fluid-example/prosemirror](/examples/data-objects/prosemirror)</br>- [@fluid-example/shared-text](/examples/data-objects/shared-text)</br>- [@fluid-example/simple-fluidobject-embed](/examples/data-objects/simple-fluidobject-embed)</br>- [@fluid-example/smde](/examples/data-objects/smde)</br>- [@fluid-example/table-document](/examples/data-objects/table-document)</br>- [@fluid-example/table-view](/examples/data-objects/table-view)</br>- [@fluid-example/task-selection](/examples/data-objects/task-selection)</br>- [@fluid-example/todo](/examples/data-objects/todo)</br>- [@fluid-example/vltava](/examples/data-objects/vltava)</br>- [@fluid-example/webflow](/examples/data-objects/webflow)</br>- [@fluid-example/app-integration-container-views](/examples/hosts/app-integration/container-views)</br>- [@fluid-example/app-integration-external-controller](/examples/hosts/app-integration/external-controller)</br>- [@fluid-example/app-integration-external-views](/examples/hosts/app-integration/external-views)</br>- [@fluid-example/app-integration-schema-upgrade](/examples/hosts/app-integration/schema-upgrade)</br>- [@fluid-example/host-service-interfaces](/examples/hosts/host-service-interfaces)</br>- [@fluid-internal/hosts-sample](/examples/hosts/hosts-sample) (private)</br>- [@fluid-example/iframe-host](/examples/hosts/iframe-host)</br>- [@fluid-internal/node-host](/examples/hosts/node-host) (private)</br>- [@fluid-example/bundle-size-tests](/examples/utils/bundle-size-tests)</br>- [@fluid-example/example-utils](/examples/utils/example-utils)</br>- [@fluid-experimental/partial-checkout](/experimental/PropertyDDS/examples/partial-checkout)</br>- [@fluid-experimental/property-inspector](/experimental/PropertyDDS/examples/property-inspector)</br>- [@fluid-experimental/schemas](/experimental/PropertyDDS/examples/schemas)</br>- [@fluid-experimental/property-query-service](/experimental/PropertyDDS/services/property-query-service) (private)</br>- [@fluid-example/bubblebench-baseline](/experimental/examples/bubblebench/baseline)</br>- [@fluid-example/bubblebench-common](/experimental/examples/bubblebench/common)</br>- [@fluid-example/bubblebench-ot](/experimental/examples/bubblebench/ot)</br>- [@fluid-example/bubblebench-sharedtree](/experimental/examples/bubblebench/sharedtree) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [UberPackage](#UberPackage)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [ServiceClients](#ServiceClients)</br>- [Test-Utils](#Test-Utils)</br>- [HostUtils](#HostUtils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Tools

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-tools/fetch-tool](/packages/tools/fetch-tool)</br>- [@fluid-internal/merge-tree-client-replay](/packages/tools/merge-tree-client-replay) (private)</br>- [@fluid-internal/replay-tool](/packages/tools/replay-tool) (private)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [ServiceClients](#ServiceClients)</br>- [Test-Utils](#Test-Utils) |

### Tests

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-internal/functional-tests](/packages/test/functional-tests) (private)</br>- [@fluid-internal/local-server-tests](/packages/test/local-server-tests) (private)</br>- [@fluidframework/mocha-test-setup](/packages/test/mocha-test-setup)</br>- [@fluid-internal/test-snapshots](/packages/test/snapshots) (private)</br>- [@fluid-internal/test-app-insights-logger](/packages/test/test-app-insights-logger)</br>- [@fluidframework/test-driver-definitions](/packages/test/test-driver-definitions)</br>- [@fluidframework/test-drivers](/packages/test/test-drivers)</br>- [@fluidframework/test-end-to-end-tests](/packages/test/test-end-to-end-tests)</br>- [@fluidframework/test-pairwise-generator](/packages/test/test-pairwise-generator)</br>- [@fluid-internal/test-service-load](/packages/test/test-service-load)</br>- [@fluidframework/test-utils](/packages/test/test-utils)</br>- [@fluidframework/test-version-utils](/packages/test/test-version-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Container-Utils](#Container-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Server-Libs](#Server-Libs)</br>- [Server-Tools](#Server-Tools)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Test-Utils](#Test-Utils)</br>- [Tools](#Tools) |

### Routerlicious-Server

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-routerlicious](/server/routerlicious/packages/routerlicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

