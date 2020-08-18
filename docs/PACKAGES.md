# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

_These are the logical layers into which our packages are grouped.
The dependencies between layers are enforced by the layer-check command._

### Base-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/common-definitions](/common/lib/common-definitions)</br>- [@fluidframework/core-interfaces](/packages/loader/core-interfaces)</br>- [@fluidframework/gitresources](/server/routerlicious/packages/gitresources) | &nbsp;</br>&nbsp;</br>&nbsp; |

### Protocol-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/protocol-definitions](/server/routerlicious/packages/protocol-definitions) | - [Base-Definitions](#Base-Definitions) |

### Driver-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/driver-definitions](/packages/loader/driver-definitions)</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions) |

### Container-Definitions

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-definitions](/packages/loader/container-definitions)</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions) |

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

### Other-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/odsp-utils](/packages/utils/odsp-utils) | &nbsp; |

### Tool-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/tool-utils](/packages/utils/tool-utils) | - [Other-Utils](#Other-Utils) |

### Telemetry-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/telemetry-utils](/packages/utils/telemetry-utils)</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Base-Utils](#Base-Utils) |

### Driver-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/driver-utils](/packages/loader/driver-utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils) |

### Container-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-utils](/packages/loader/container-utils)</br>&nbsp; | - [Container-Definitions](#Container-Definitions)</br>- [Telemetry-Utils](#Telemetry-Utils) |

### Driver

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/debugger](/packages/drivers/debugger)</br>- [@fluidframework/driver-base](/packages/drivers/driver-base)</br>- [@fluidframework/file-driver](/packages/drivers/file-driver)</br>- [@fluidframework/fluidapp-odsp-urlresolver](/packages/drivers/fluidapp-odsp-urlResolver)</br>- [@fluidframework/iframe-driver](/packages/drivers/iframe-driver)</br>- [@fluidframework/odsp-driver](/packages/drivers/odsp-driver)</br>- [@fluidframework/odsp-urlresolver](/packages/drivers/odsp-urlResolver)</br>- [@fluidframework/replay-driver](/packages/drivers/replay-driver)</br>- [@fluidframework/routerlicious-host](/packages/drivers/routerlicious-host) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>&nbsp;</br>&nbsp; |

### Loader

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-loader](/packages/loader/container-loader)</br>- [@fluidframework/execution-context-loader](/packages/loader/execution-context-loader)</br>- [@fluid-internal/test-loader-utils](/packages/loader/test-loader-utils) (private)</br>- [@fluidframework/web-code-loader](/packages/loader/web-code-loader)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils) |

### Hosts

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/base-host](/packages/hosts/base-host)</br>- [@fluidframework/host-service-interfaces](/packages/hosts/host-service-interfaces)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Loader](#Loader) |

### Runtime

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/agent-scheduler](/packages/runtime/agent-scheduler)</br>- [@fluidframework/cell](/packages/dds/cell)</br>- [@fluidframework/counter](/packages/dds/counter)</br>- [@fluidframework/ink](/packages/dds/ink)</br>- [@fluidframework/map](/packages/dds/map)</br>- [@fluidframework/matrix](/packages/dds/matrix)</br>- [@fluidframework/merge-tree](/packages/dds/merge-tree)</br>- [@fluidframework/ordered-collection](/packages/dds/ordered-collection)</br>- [@fluidframework/register-collection](/packages/dds/register-collection)</br>- [@fluidframework/sequence](/packages/dds/sequence)</br>- [@fluidframework/shared-object-base](/packages/dds/shared-object-base)</br>- [@fluidframework/shared-summary-block](/packages/dds/shared-summary-block)</br>- [@fluidframework/datastore](/packages/runtime/component-runtime)</br>- [@fluidframework/datastore-definitions](/packages/runtime/datastore-definitions)</br>- [@fluidframework/container-runtime](/packages/runtime/container-runtime)</br>- [@fluidframework/container-runtime-definitions](/packages/runtime/container-runtime-definitions)</br>- [@fluidframework/runtime-definitions](/packages/runtime/runtime-definitions)</br>- [@fluidframework/runtime-utils](/packages/runtime/runtime-utils) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Framework

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-internal/client-api](/packages/runtime/client-api)</br>- [@fluidframework/aqueduct](/packages/framework/aqueduct)</br>- [@fluidframework/data-object-base](/packages/framework/data-object-base)</br>- [@fluidframework/dds-interceptions](/packages/framework/dds-interceptions)</br>- [@fluidframework/framework-experimental](/packages/framework/framework-experimental)</br>- [@fluidframework/framework-interfaces](/packages/framework/framework-interfaces)</br>- [@fluidframework/last-edited-experimental](/packages/framework/last-edited-experimental)</br>- [@fluidframework/react](/packages/framework/react)</br>- [@fluidframework/request-handler](/packages/framework/request-handler)</br>- [@fluidframework/synthesize](/packages/framework/synthesize)</br>- [@fluidframework/undo-redo](/packages/framework/undo-redo) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime) |

### Component

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-example/badge](/components/examples/badge)</br>- [@fluid-example/clicker](/components/examples/clicker)</br>- [@fluid-example/collaborative-textarea](/components/examples/collaborative-textarea)</br>- [@fluid-example/diceroller](/components/examples/diceroller)</br>- [@fluid-example/pond](/components/examples/pond)</br>- [@fluid-example/primitives](/components/examples/primitives)</br>- [@fluid-example/simple-component-embed](/components/examples/simple-component-embed)</br>- [@fluid-example/canvas](/components/experimental/canvas)</br>- [@fluid-example/clicker-context](/components/experimental/clicker-react/clicker-context)</br>- [@fluid-example/clicker-function](/components/experimental/clicker-react/clicker-function)</br>- [@fluid-example/clicker-react](/components/experimental/clicker-react/clicker-react)</br>- [@fluid-example/clicker-reducer](/components/experimental/clicker-react/clicker-reducer)</br>- [@fluid-example/clicker-with-hook](/components/experimental/clicker-react/clicker-with-hook)</br>- [@fluid-example/client-ui-lib](/components/experimental/client-ui-lib)</br>- [@fluid-example/codemirror](/components/experimental/codemirror)</br>- [@fluid-example/draft-js](/components/experimental/draft-js)</br>- [@fluidframework/external-component-loader](/components/experimental/external-component-loader)</br>- [@fluid-example/flow-util-lib](/components/experimental/flow-util-lib)</br>- [@fluid-example/image-collection](/components/experimental/image-collection)</br>- [@fluid-example/image-gallery](/components/experimental/image-gallery)</br>- [@fluid-example/key-value-cache](/components/experimental/key-value-cache)</br>- [@fluid-example/likes-and-comments](/components/experimental/likes-and-comments)</br>- [@fluid-example/math](/components/experimental/math)</br>- [@fluid-example/monaco](/components/experimental/monaco)</br>- [@fluid-example/multiview-container](/components/experimental/multiview/container)</br>- [@fluid-example/multiview-coordinate-interface](/components/experimental/multiview/interface)</br>- [@fluid-example/multiview-coordinate-model](/components/experimental/multiview/model)</br>- [@fluid-example/multiview-plot-coordinate-view](/components/experimental/multiview/plot-coordinate-view)</br>- [@fluid-example/multiview-slider-coordinate-view](/components/experimental/multiview/slider-coordinate-view)</br>- [@fluid-example/multiview-triangle-view](/components/experimental/multiview/triangle-view)</br>- [@fluid-example/musica](/components/experimental/musica)</br>- [@fluid-example/progress-bars](/components/experimental/progress-bars)</br>- [@fluid-example/prosemirror](/components/experimental/prosemirror)</br>- [@fluidframework/react-inputs](/components/experimental/react-inputs)</br>- [@fluid-example/scribe](/components/experimental/scribe)</br>- [@fluid-example/search-menu](/components/experimental/search-menu)</br>- [@fluid-example/shared-text](/components/experimental/shared-text)</br>- [@fluid-example/smde](/components/experimental/smde)</br>- [@fluid-example/spaces](/components/experimental/spaces)</br>- [@fluid-example/sudoku](/components/experimental/sudoku)</br>- [@fluid-example/table-document](/components/experimental/table-document)</br>- [@fluid-example/table-view](/components/experimental/table-view)</br>- [@fluid-example/todo](/components/experimental/todo)</br>- [@fluid-example/video-players](/components/experimental/video-players)</br>- [@fluid-example/vltava](/components/experimental/vltava)</br>- [@fluid-example/webflow](/components/experimental/webflow)</br>- [@fluid-example/intelligence-runner-agent](/packages/agents/intelligence-runner-agent) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Loader](#Loader)</br>- [Hosts](#Hosts)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Build

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/build-common](/common/build/build-common)</br>- [@fluidframework/eslint-config-fluid](/common/build/eslint-config-fluid) | &nbsp;</br>&nbsp; |

### Server-Shared-Utils

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-services-client](/server/routerlicious/packages/services-client)</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils) |

### Server-Libs

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-kafka-orderer](/server/routerlicious/packages/kafka-orderer)</br>- [@fluidframework/server-lambdas](/server/routerlicious/packages/lambdas)</br>- [@fluidframework/server-lambdas-driver](/server/routerlicious/packages/lambdas-driver)</br>- [@fluidframework/server-local-server](/server/routerlicious/packages/local-server)</br>- [@fluidframework/server-memory-orderer](/server/routerlicious/packages/memory-orderer)</br>- [@fluidframework/server-services](/server/routerlicious/packages/services)</br>- [@fluidframework/server-services-core](/server/routerlicious/packages/services-core)</br>- [@fluidframework/server-services-shared](/server/routerlicious/packages/services-shared)</br>- [@fluidframework/server-services-utils](/server/routerlicious/packages/services-utils)</br>- [@fluidframework/server-test-utils](/server/routerlicious/packages/test-utils) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Server-Tools

| Packages | Layer Dependencies |
| --- | --- |
| - [tinylicious](/server/tinylicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

### Routerlicious-Driver

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/routerlicious-driver](/packages/drivers/routerlicious-driver)</br>- [@fluidframework/routerlicious-urlresolver](/packages/drivers/routerlicious-urlResolver)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Server-Shared-Utils](#Server-Shared-Utils) |

### Tools

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-internal/fetch-tool](/packages/tools/fetch-tool) (private)</br>- [@fluidframework/get-tinylicious-container](/packages/tools/get-tinylicious-container)</br>- [@fluid-internal/merge-tree-client-replay](/packages/tools/merge-tree-client-replay) (private)</br>- [@fluid-internal/replay-tool](/packages/tools/replay-tool) (private)</br>- [generator-fluid](/tools/generator-fluid)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Hosts](#Hosts)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Routerlicious-Driver](#Routerlicious-Driver) |

### Test

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/local-web-host](/packages/hosts/local-web-host)</br>- [@fluidframework/local-driver](/packages/drivers/local-driver)</br>- [@fluidframework/test-runtime-utils](/packages/runtime/test-runtime-utils)</br>- [@fluidframework/webpack-fluid-loader](/packages/tools/webpack-fluid-loader)</br>- [@fluid-example/app-integration-container-views](/examples/hosts/app-integration/container-views)</br>- [@fluid-example/app-integration-external-views](/examples/hosts/app-integration/external-views)</br>- [@fluid-internal/hosts-sample](/examples/hosts/hosts-sample) (private)</br>- [@fluid-example/iframe-host](/examples/hosts/iframe-host)</br>- [@fluid-internal/node-host](/examples/hosts/node-host) (private)</br>- [@fluid-internal/end-to-end-tests](/packages/test/end-to-end-tests) (private)</br>- [@fluid-internal/functional-tests](/packages/test/functional-tests) (private)</br>- [@fluid-internal/service-load-test](/packages/test/service-load-test) (private)</br>- [@fluid-internal/test-snapshots](/packages/test/snapshots) (private)</br>- [@fluidframework/test-utils](/packages/test/test-utils)</br>- [@fluid-internal/version-test-1](/packages/test/version-test-1) (private)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Hosts](#Hosts)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Component](#Component)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Tools](#Tools) |

### Routerlicious-Server

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-routerlicious](/server/routerlicious/packages/routerlicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |
