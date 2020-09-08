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
| - [@fluidframework/tool-utils](/packages/utils/tool-utils)</br>&nbsp; | - [Base-Utils](#Base-Utils)</br>- [Other-Utils](#Other-Utils) |

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
| - [@fluidframework/debugger](/packages/drivers/debugger)</br>- [@fluidframework/driver-base](/packages/drivers/driver-base)</br>- [@fluidframework/file-driver](/packages/drivers/file-driver)</br>- [@fluid-internal/fluidapp-odsp-urlresolver](/packages/drivers/fluidapp-odsp-urlResolver) (private)</br>- [@fluidframework/iframe-driver](/packages/drivers/iframe-driver)</br>- [@fluidframework/odsp-driver](/packages/drivers/odsp-driver)</br>- [@fluidframework/odsp-urlresolver](/packages/drivers/odsp-urlResolver)</br>- [@fluidframework/replay-driver](/packages/drivers/replay-driver)</br>- [@fluidframework/routerlicious-host](/packages/drivers/routerlicious-host) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>&nbsp;</br>&nbsp; |

### Loader

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/container-loader](/packages/loader/container-loader)</br>- [@fluidframework/execution-context-loader](/packages/loader/execution-context-loader)</br>- [@fluid-internal/test-loader-utils](/packages/loader/test-loader-utils) (private)</br>- [@fluidframework/web-code-loader](/packages/loader/web-code-loader)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils) |

### Hosts

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/base-host](/packages/hosts/base-host)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Loader](#Loader) |

### Runtime

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/agent-scheduler](/packages/runtime/agent-scheduler)</br>- [@fluidframework/cell](/packages/dds/cell)</br>- [@fluidframework/counter](/packages/dds/counter)</br>- [@fluidframework/ink](/packages/dds/ink)</br>- [@fluidframework/map](/packages/dds/map)</br>- [@fluidframework/matrix](/packages/dds/matrix)</br>- [@fluidframework/merge-tree](/packages/dds/merge-tree)</br>- [@fluidframework/ordered-collection](/packages/dds/ordered-collection)</br>- [@fluidframework/register-collection](/packages/dds/register-collection)</br>- [@fluidframework/sequence](/packages/dds/sequence)</br>- [@fluidframework/shared-object-base](/packages/dds/shared-object-base)</br>- [@fluidframework/shared-summary-block](/packages/dds/shared-summary-block)</br>- [@fluidframework/container-runtime](/packages/runtime/container-runtime)</br>- [@fluidframework/container-runtime-definitions](/packages/runtime/container-runtime-definitions)</br>- [@fluidframework/datastore](/packages/runtime/datastore)</br>- [@fluidframework/datastore-definitions](/packages/runtime/datastore-definitions)</br>- [@fluidframework/runtime-definitions](/packages/runtime/runtime-definitions)</br>- [@fluidframework/runtime-utils](/packages/runtime/runtime-utils) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Protocol-Utils](#Protocol-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Container-Utils](#Container-Utils)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Framework

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-internal/client-api](/packages/runtime/client-api)</br>- [@fluidframework/aqueduct](/packages/framework/aqueduct)</br>- [@fluidframework/data-object-base](/packages/framework/data-object-base)</br>- [@fluidframework/dds-interceptions](/packages/framework/dds-interceptions)</br>- [@fluidframework/last-edited-experimental](/packages/framework/last-edited-experimental)</br>- [@fluidframework/react](/packages/framework/react)</br>- [@fluidframework/request-handler](/packages/framework/request-handler)</br>- [@fluidframework/synthesize](/packages/framework/synthesize)</br>- [@fluidframework/undo-redo](/packages/framework/undo-redo) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>&nbsp; |

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
| - [@fluid-internal/fetch-tool](/packages/tools/fetch-tool) (private)</br>- [@fluid-internal/merge-tree-client-replay](/packages/tools/merge-tree-client-replay) (private)</br>- [@fluid-internal/replay-tool](/packages/tools/replay-tool) (private)</br>- [generator-fluid](/tools/generator-fluid)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Routerlicious-Driver](#Routerlicious-Driver) |

### Test

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/local-driver](/packages/drivers/local-driver)</br>- [@fluidframework/test-runtime-utils](/packages/runtime/test-runtime-utils)</br>- [@fluidframework/webpack-fluid-loader](/packages/tools/webpack-fluid-loader)</br>- [@fluid-internal/end-to-end-tests](/packages/test/end-to-end-tests) (private)</br>- [@fluid-internal/functional-tests](/packages/test/functional-tests) (private)</br>- [@fluidframework/mocha-test-setup](/packages/test/mocha-test-setup)</br>- [@fluid-internal/service-load-test](/packages/test/service-load-test) (private)</br>- [@fluid-internal/test-snapshots](/packages/test/snapshots) (private)</br>- [@fluidframework/test-utils](/packages/test/test-utils)</br>- [@fluid-internal/version-test-1](/packages/test/version-test-1) (private)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Other-Utils](#Other-Utils)</br>- [Tool-Utils](#Tool-Utils)</br>- [Telemetry-Utils](#Telemetry-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Hosts](#Hosts)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Tools](#Tools) |

### Examples

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluid-example/collaborative-textarea](/examples/apps/collaborative-textarea)</br>- [@fluid-example/likes-and-comments](/examples/apps/likes-and-comments)</br>- [@fluid-example/spaces](/examples/apps/spaces)</br>- [@fluid-example/badge](/examples/data-objects/badge)</br>- [@fluid-example/canvas](/examples/data-objects/canvas)</br>- [@fluid-example/clicker](/examples/data-objects/clicker)</br>- [@fluid-example/clicker-context](/examples/data-objects/clicker-react/clicker-context)</br>- [@fluid-example/clicker-function](/examples/data-objects/clicker-react/clicker-function)</br>- [@fluid-example/clicker-react](/examples/data-objects/clicker-react/clicker-react)</br>- [@fluid-example/clicker-reducer](/examples/data-objects/clicker-react/clicker-reducer)</br>- [@fluid-example/clicker-with-hook](/examples/data-objects/clicker-react/clicker-with-hook)</br>- [@fluid-example/client-ui-lib](/examples/data-objects/client-ui-lib)</br>- [@fluid-example/codemirror](/examples/data-objects/codemirror)</br>- [@fluid-example/diceroller](/examples/data-objects/diceroller)</br>- [@fluid-example/flow-util-lib](/examples/data-objects/flow-util-lib)</br>- [@fluid-example/image-collection](/examples/data-objects/image-collection)</br>- [@fluid-example/image-gallery](/examples/data-objects/image-gallery)</br>- [@fluid-example/key-value-cache](/examples/data-objects/key-value-cache)</br>- [@fluid-example/math](/examples/data-objects/math)</br>- [@fluid-example/monaco](/examples/data-objects/monaco)</br>- [@fluid-example/multiview-constellation-model](/examples/data-objects/multiview/constellation-model)</br>- [@fluid-example/multiview-constellation-view](/examples/data-objects/multiview/constellation-view)</br>- [@fluid-example/multiview-container](/examples/data-objects/multiview/container)</br>- [@fluid-example/multiview-coordinate-model](/examples/data-objects/multiview/coordinate-model)</br>- [@fluid-example/multiview-coordinate-interface](/examples/data-objects/multiview/interface)</br>- [@fluid-example/multiview-plot-coordinate-view](/examples/data-objects/multiview/plot-coordinate-view)</br>- [@fluid-example/multiview-slider-coordinate-view](/examples/data-objects/multiview/slider-coordinate-view)</br>- [@fluid-example/multiview-triangle-view](/examples/data-objects/multiview/triangle-view)</br>- [@fluid-example/musica](/examples/data-objects/musica)</br>- [@fluid-example/pond](/examples/data-objects/pond)</br>- [@fluid-example/primitives](/examples/data-objects/primitives)</br>- [@fluid-example/progress-bars](/examples/data-objects/progress-bars)</br>- [@fluid-example/prosemirror](/examples/data-objects/prosemirror)</br>- [@fluidframework/react-inputs](/examples/data-objects/react-inputs)</br>- [@fluid-example/scribe](/examples/data-objects/scribe)</br>- [@fluid-example/search-menu](/examples/data-objects/search-menu)</br>- [@fluid-example/shared-text](/examples/data-objects/shared-text)</br>- [@fluid-example/simple-fluidobject-embed](/examples/data-objects/simple-fluidobject-embed)</br>- [@fluid-example/smde](/examples/data-objects/smde)</br>- [@fluid-example/table-document](/examples/data-objects/table-document)</br>- [@fluid-example/table-view](/examples/data-objects/table-view)</br>- [@fluid-example/todo](/examples/data-objects/todo)</br>- [@fluid-example/video-players](/examples/data-objects/video-players)</br>- [@fluid-example/vltava](/examples/data-objects/vltava)</br>- [@fluid-example/webflow](/examples/data-objects/webflow)</br>- [@fluid-example/app-integration-container-views](/examples/hosts/app-integration/container-views)</br>- [@fluid-example/app-integration-external-views](/examples/hosts/app-integration/external-views)</br>- [@fluid-example/host-service-interfaces](/examples/hosts/host-service-interfaces)</br>- [@fluid-internal/hosts-sample](/examples/hosts/hosts-sample) (private)</br>- [@fluid-example/iframe-host](/examples/hosts/iframe-host)</br>- [@fluid-internal/node-host](/examples/hosts/node-host) (private)</br>- [@fluid-example/fluid-object-interfaces](/examples/utils/fluid-object-interfaces)</br>- [@fluidframework/get-session-storage-container](/examples/utils/get-session-storage-container)</br>- [@fluidframework/get-tinylicious-container](/examples/utils/get-tinylicious-container)</br>- [@fluid-example/intelligence-runner-agent](/packages/agents/intelligence-runner-agent) | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Container-Definitions](#Container-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Framework-Utils](#Framework-Utils)</br>- [Driver-Utils](#Driver-Utils)</br>- [Driver](#Driver)</br>- [Loader](#Loader)</br>- [Hosts](#Hosts)</br>- [Runtime](#Runtime)</br>- [Framework](#Framework)</br>- [Server-Libs](#Server-Libs)</br>- [Routerlicious-Driver](#Routerlicious-Driver)</br>- [Test](#Test)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; |

### Routerlicious-Server

| Packages | Layer Dependencies |
| --- | --- |
| - [@fluidframework/server-routerlicious](/server/routerlicious/packages/routerlicious)</br>&nbsp;</br>&nbsp;</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions)</br>- [Base-Utils](#Base-Utils)</br>- [Server-Shared-Utils](#Server-Shared-Utils)</br>- [Server-Libs](#Server-Libs) |

