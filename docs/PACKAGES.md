# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

## Client

### Build

Packages:

- [@fluidframework/build-common](/common/build/build-common)
- [@fluidframework/eslint-config-fluid](/common/build/eslint-config-fluid)

### Component

Packages:

- [@fluid-example/badge](/components/examples/badge)
- [@fluid-example/canvas](/components/experimental/canvas)
- [@fluid-example/clicker](/components/examples/clicker)
- [@fluid-example/clicker-react](/components/experimental/clicker-react/clicker-react)
- [@fluid-example/clicker-with-hooks](/components/experimental/clicker-react/clicker-with-hooks)
- [@fluid-example/client-ui-lib](/components/experimental/client-ui-lib)
- [@fluid-example/codemirror](/components/experimental/codemirror)
- [@fluid-example/collaborative-textarea](/components/examples/collaborative-textarea)
- [@fluid-example/diceroller](/components/examples/diceroller)
- [@fluid-example/draft-js](/components/experimental/draft-js)
- [@fluid-example/flow-intel](/packages/agents/flow-intel)
- [@fluid-example/flow-intel-viewer](/packages/agents/flow-intel-viewer)
- [@fluid-example/flow-util-lib](/components/experimental/flow-util-lib)
- [@fluid-example/image-collection](/components/experimental/image-collection)
- [@fluid-example/image-gallery](/components/experimental/image-gallery)
- [@fluid-example/intelligence-runner-agent](/packages/agents/intelligence-runner-agent)
- [@fluid-example/key-value-cache](/components/experimental/key-value-cache)
- [@fluid-example/math](/components/experimental/math)
- [@fluid-example/monaco](/components/experimental/monaco)
- [@fluid-example/multiview-container](/components/experimental/multiview/container)
- [@fluid-example/multiview-coordinate-interface](/components/experimental/multiview/interface)
- [@fluid-example/multiview-coordinate-model](/components/experimental/multiview/model)
- [@fluid-example/multiview-plot-coordinate-view](/components/experimental/multiview/plot-coordinate-view)
- [@fluid-example/multiview-slider-coordinate-view](/components/experimental/multiview/slider-coordinate-view)
- [@fluid-example/multiview-triangle-view](/components/experimental/multiview/triangle-view)
- [@fluid-example/musica](/components/experimental/musica)
- [@fluid-example/pond](/components/examples/pond)
- [@fluid-example/primitives](/components/examples/primitives)
- [@fluid-example/progress-bars](/components/experimental/progress-bars)
- [@fluid-example/prosemirror](/components/experimental/prosemirror)
- [@fluid-example/scribe](/components/experimental/scribe)
- [@fluid-example/search-menu](/components/experimental/search-menu)
- [@fluid-example/shared-text](/components/experimental/shared-text)
- [@fluid-example/simple-component-embed](/components/examples/simple-component-embed)
- [@fluid-example/smde](/components/experimental/smde)
- [@fluid-example/snapshotter-agent](/packages/agents/snapshotter-agent)
- [@fluid-example/spaces](/components/experimental/spaces)
- [@fluid-example/spellchecker-agent](/packages/agents/spellchecker-agent)
- [@fluid-example/sudoku](/components/experimental/sudoku)
- [@fluid-example/table-document](/components/experimental/table-document)
- [@fluid-example/table-view](/components/experimental/table-view)
- [@fluid-example/todo](/components/experimental/todo)
- [@fluid-example/translator-agent](/packages/agents/translator-agent)
- [@fluid-example/video-players](/components/experimental/video-players)
- [@fluid-example/vltava](/components/experimental/vltava)
- [@fluid-example/webflow](/components/experimental/webflow)
- [@fluidframework/external-component-loader](/components/experimental/external-component-loader)
- [@fluidframework/react-inputs](/components/experimental/react-inputs)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Component](#Component)
- [Container-Definitions](#Container-Definitions)
- [Framework](#Framework)
- [Framework-Utils](#Framework-Utils)
- [Hosts](#Hosts)
- [Loader](#Loader)
- [Protocol-Definitions](#Protocol-Definitions)
- [Runtime](#Runtime)

### Driver

Packages:

- [@fluid-internal/experimental-creation-driver](/packages/drivers/experimental-creation-driver)
- [@fluidframework/debugger](/packages/drivers/debugger)
- [@fluidframework/driver-base](/packages/drivers/driver-base)
- [@fluidframework/file-driver](/packages/drivers/file-driver)
- [@fluidframework/fluidapp-odsp-urlresolver](/packages/drivers/fluidapp-odsp-urlResolver)
- [@fluidframework/iframe-driver](/packages/drivers/iframe-driver)
- [@fluidframework/odsp-driver](/packages/drivers/odsp-driver)
- [@fluidframework/odsp-urlresolver](/packages/drivers/odsp-urlResolver)
- [@fluidframework/replay-driver](/packages/drivers/replay-driver)
- [@fluidframework/routerlicious-host](/packages/drivers/routerlicious-host)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver](#Driver)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)

### Framework

Packages:

- [@fluid-internal/client-api](/packages/runtime/client-api)
- [@fluidframework/aqueduct](/packages/framework/aqueduct)
- [@fluidframework/component-base](/packages/framework/component-base)
- [@fluidframework/dds-interceptions](/packages/framework/dds-interceptions)
- [@fluidframework/framework-experimental](/packages/framework/framework-experimental)
- [@fluidframework/framework-interfaces](/packages/framework/framework-interfaces)
- [@fluidframework/last-edited-experimental](/packages/framework/last-edited-experimental)
- [@fluidframework/react](/packages/framework/react)
- [@fluidframework/synthesize](/packages/framework/synthesize)
- [@fluidframework/undo-redo](/packages/framework/undo-redo)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Framework](#Framework)
- [Framework-Utils](#Framework-Utils)
- [Loader](#Loader)
- [Protocol-Definitions](#Protocol-Definitions)
- [Runtime](#Runtime)

### Hosts

Packages:

- [@fluidframework/base-host](/packages/hosts/base-host)
- [@fluidframework/host-service-interfaces](/packages/hosts/host-service-interfaces)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver-Definitions](#Driver-Definitions)
- [Loader](#Loader)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)

### Loader

Packages:

- [@fluid-internal/test-loader-utils](/packages/loader/test-loader-utils)
- [@fluidframework/container-loader](/packages/loader/container-loader)
- [@fluidframework/execution-context-loader](/packages/loader/execution-context-loader)
- [@fluidframework/web-code-loader](/packages/loader/web-code-loader)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)

### Runtime

Packages:

- [@fluidframework/agent-scheduler](/packages/runtime/agent-scheduler)
- [@fluidframework/cell](/packages/dds/cell)
- [@fluidframework/component-runtime](/packages/runtime/component-runtime)
- [@fluidframework/component-runtime-definitions](/packages/runtime/component-runtime-definitions)
- [@fluidframework/container-runtime](/packages/runtime/container-runtime)
- [@fluidframework/container-runtime-definitions](/packages/runtime/container-runtime-definitions)
- [@fluidframework/counter](/packages/dds/counter)
- [@fluidframework/ink](/packages/dds/ink)
- [@fluidframework/map](/packages/dds/map)
- [@fluidframework/matrix](/packages/dds/matrix)
- [@fluidframework/merge-tree](/packages/dds/merge-tree)
- [@fluidframework/ordered-collection](/packages/dds/ordered-collection)
- [@fluidframework/register-collection](/packages/dds/register-collection)
- [@fluidframework/runtime-definitions](/packages/runtime/runtime-definitions)
- [@fluidframework/runtime-utils](/packages/runtime/runtime-utils)
- [@fluidframework/sequence](/packages/dds/sequence)
- [@fluidframework/shared-object-base](/packages/dds/shared-object-base)
- [@fluidframework/shared-summary-block](/packages/dds/shared-summary-block)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)
- [Runtime](#Runtime)

### Test

Packages:

- [@fluid-example/iframe-host](/examples/hosts/iframe-host)
- [@fluid-internal/end-to-end-tests](/packages/test/end-to-end-tests)
- [@fluid-internal/functional-tests](/packages/test/functional-tests)
- [@fluid-internal/hosts-sample](/examples/hosts/hosts-sample)
- [@fluid-internal/node-host](/examples/hosts/node-host)
- [@fluid-internal/test-snapshots](/packages/test/snapshots)
- [@fluid-internal/version-test-1](/packages/test/version-test-1)
- [@fluid-internal/version-test-2](/packages/test/version-test-1/@fluid-internal/version-test-2)
- [@fluidframework/local-driver](/packages/drivers/local-driver)
- [@fluidframework/local-web-host](/packages/hosts/local-web-host)
- [@fluidframework/test-runtime-utils](/packages/runtime/test-runtime-utils)
- [@fluidframework/test-utils](/packages/test/test-utils)
- [@fluidframework/webpack-component-loader](/packages/tools/webpack-component-loader)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Component](#Component)
- [Container-Definitions](#Container-Definitions)
- [Driver](#Driver)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Framework](#Framework)
- [Framework-Utils](#Framework-Utils)
- [Hosts](#Hosts)
- [Loader](#Loader)
- [Other-Utils](#Other-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Routerlicious-Driver](#Routerlicious-Driver)
- [Runtime](#Runtime)
- [Server-Libs](#Server-Libs)
- [Server-Shared-Utils](#Server-Shared-Utils)
- [Test](#Test)
- [Tool-Utils](#Tool-Utils)
- [Tools](#Tools)

### Tools

Packages:

- [@fluid-internal/fetch-tool](/packages/tools/fetch-tool)
- [@fluid-internal/merge-tree-client-replay](/packages/tools/merge-tree-client-replay)
- [@fluid-internal/replay-tool](/packages/tools/replay-tool)
- [dice-roller](/tools/generator-fluid/app/templates)
- [generator-fluid](/tools/generator-fluid)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver](#Driver)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Framework](#Framework)
- [Framework-Utils](#Framework-Utils)
- [Loader](#Loader)
- [Other-Utils](#Other-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Routerlicious-Driver](#Routerlicious-Driver)
- [Runtime](#Runtime)
- [Tool-Utils](#Tool-Utils)

## Definitions

### Base-Definitions

Packages:

- [@fluidframework/common-definitions](/common/lib/common-definitions)
- [@fluidframework/component-core-interfaces](/packages/loader/component-core-interfaces)
- [@fluidframework/gitresources](/server/routerlicious/packages/gitresources)

### Container-Definitions

Packages:

- [@fluidframework/container-definitions](/packages/loader/container-definitions)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Driver-Definitions](#Driver-Definitions)
- [Protocol-Definitions](#Protocol-Definitions)

### Driver-Definitions

Packages:

- [@fluidframework/driver-definitions](/packages/loader/driver-definitions)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Protocol-Definitions](#Protocol-Definitions)

### Protocol-Definitions

Packages:

- [@fluidframework/protocol-definitions](/server/routerlicious/packages/protocol-definitions)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)

## Routerlicious

### Routerlicious-Driver

Packages:

- [@fluidframework/routerlicious-driver](/packages/drivers/routerlicious-driver)
- [@fluidframework/routerlicious-urlresolver](/packages/drivers/routerlicious-urlResolver)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver](#Driver)
- [Driver-Definitions](#Driver-Definitions)
- [Driver-Utils](#Driver-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)
- [Server-Shared-Utils](#Server-Shared-Utils)

### Routerlicious-Server

Packages:

- [@fluidframework/server-routerlicious](/server/routerlicious/packages/routerlicious)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Server-Libs](#Server-Libs)
- [Server-Shared-Utils](#Server-Shared-Utils)

## Server

### Server-Libs

Packages:

- [@fluidframework/server-kafka-orderer](/server/routerlicious/packages/kafka-orderer)
- [@fluidframework/server-lambdas](/server/routerlicious/packages/lambdas)
- [@fluidframework/server-lambdas-driver](/server/routerlicious/packages/lambdas-driver)
- [@fluidframework/server-local-server](/server/routerlicious/packages/local-server)
- [@fluidframework/server-memory-orderer](/server/routerlicious/packages/memory-orderer)
- [@fluidframework/server-services](/server/routerlicious/packages/services)
- [@fluidframework/server-services-core](/server/routerlicious/packages/services-core)
- [@fluidframework/server-services-shared](/server/routerlicious/packages/services-shared)
- [@fluidframework/server-services-utils](/server/routerlicious/packages/services-utils)
- [@fluidframework/server-test-utils](/server/routerlicious/packages/test-utils)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)
- [Server-Libs](#Server-Libs)
- [Server-Shared-Utils](#Server-Shared-Utils)

### Server-Shared-Utils

Packages:

- [@fluidframework/server-services-client](/server/routerlicious/packages/services-client)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)

### Server-Tools

Packages:

- [tinylicious](/server/tinylicious)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)
- [Server-Libs](#Server-Libs)
- [Server-Shared-Utils](#Server-Shared-Utils)

## Utils

### Base-Utils

Packages:

- [@fluidframework/common-utils](/common/lib/common-utils)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)

### Driver-Utils

Packages:

- [@fluidframework/driver-utils](/packages/loader/driver-utils)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Container-Definitions](#Container-Definitions)
- [Driver-Definitions](#Driver-Definitions)
- [Protocol-Definitions](#Protocol-Definitions)
- [Protocol-Utils](#Protocol-Utils)

### Framework-Utils

Packages:

- [@fluidframework/view-adapters](/packages/framework/view-adapters)
- [@fluidframework/view-interfaces](/packages/framework/view-interfaces)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Framework-Utils](#Framework-Utils)

### Other-Utils

Packages:

- [@fluidframework/odsp-utils](/packages/utils/odsp-utils)

### Protocol-Utils

Packages:

- [@fluidframework/protocol-base](/server/routerlicious/packages/protocol-base)

Layers Depended Upon:

- [Base-Definitions](#Base-Definitions)
- [Base-Utils](#Base-Utils)
- [Protocol-Definitions](#Protocol-Definitions)

### Tool-Utils

Packages:

- [@fluidframework/tool-utils](/packages/utils/tool-utils)

Layers Depended Upon:

- [Other-Utils](#Other-Utils)

