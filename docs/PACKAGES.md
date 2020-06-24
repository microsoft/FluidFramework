# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

## Client

### Build

#### Packages

- @fluidframework/build-common
- @fluidframework/eslint-config-fluid

### Component

#### Packages

- @fluid-example/badge
- @fluid-example/canvas
- @fluid-example/clicker
- @fluid-example/clicker-react
- @fluid-example/clicker-with-hooks
- @fluid-example/client-ui-lib
- @fluid-example/codemirror
- @fluid-example/collaborative-textarea
- @fluid-example/diceroller
- @fluid-example/draft-js
- @fluid-example/flow-intel
- @fluid-example/flow-intel-viewer
- @fluid-example/flow-util-lib
- @fluid-example/image-collection
- @fluid-example/image-gallery
- @fluid-example/intelligence-runner-agent
- @fluid-example/key-value-cache
- @fluid-example/math
- @fluid-example/monaco
- @fluid-example/multiview-container
- @fluid-example/multiview-coordinate-interface
- @fluid-example/multiview-coordinate-model
- @fluid-example/multiview-plot-coordinate-view
- @fluid-example/multiview-slider-coordinate-view
- @fluid-example/multiview-triangle-view
- @fluid-example/musica
- @fluid-example/pond
- @fluid-example/primitives
- @fluid-example/progress-bars
- @fluid-example/prosemirror
- @fluid-example/scribe
- @fluid-example/search-menu
- @fluid-example/shared-text
- @fluid-example/simple-component-embed
- @fluid-example/smde
- @fluid-example/snapshotter-agent
- @fluid-example/spaces
- @fluid-example/spellchecker-agent
- @fluid-example/sudoku
- @fluid-example/table-document
- @fluid-example/table-view
- @fluid-example/todo
- @fluid-example/translator-agent
- @fluid-example/video-players
- @fluid-example/vltava
- @fluid-example/webflow
- @fluidframework/external-component-loader
- @fluidframework/react-inputs

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Component
- Container-Definitions
- Framework
- Framework-Utils
- Hosts
- Loader
- Protocol-Definitions
- Runtime

### Driver

#### Packages

- @fluid-internal/experimental-creation-driver
- @fluidframework/debugger
- @fluidframework/driver-base
- @fluidframework/file-driver
- @fluidframework/fluidapp-odsp-urlresolver
- @fluidframework/iframe-driver
- @fluidframework/odsp-driver
- @fluidframework/odsp-urlresolver
- @fluidframework/replay-driver
- @fluidframework/routerlicious-host

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver
- Driver-Definitions
- Driver-Utils
- Protocol-Definitions
- Protocol-Utils

### Framework

#### Packages

- @fluid-internal/client-api
- @fluidframework/aqueduct
- @fluidframework/component-base
- @fluidframework/dds-interceptions
- @fluidframework/framework-experimental
- @fluidframework/framework-interfaces
- @fluidframework/last-edited-experimental
- @fluidframework/react
- @fluidframework/synthesize
- @fluidframework/undo-redo

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver-Definitions
- Driver-Utils
- Framework
- Framework-Utils
- Loader
- Protocol-Definitions
- Runtime

### Hosts

#### Packages

- @fluidframework/base-host
- @fluidframework/host-service-interfaces

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver-Definitions
- Loader
- Protocol-Definitions
- Protocol-Utils

### Loader

#### Packages

- @fluid-internal/test-loader-utils
- @fluidframework/container-loader
- @fluidframework/execution-context-loader
- @fluidframework/web-code-loader

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver-Definitions
- Driver-Utils
- Protocol-Definitions
- Protocol-Utils

### Runtime

#### Packages

- @fluidframework/agent-scheduler
- @fluidframework/cell
- @fluidframework/component-runtime
- @fluidframework/component-runtime-definitions
- @fluidframework/container-runtime
- @fluidframework/container-runtime-definitions
- @fluidframework/counter
- @fluidframework/ink
- @fluidframework/map
- @fluidframework/matrix
- @fluidframework/merge-tree
- @fluidframework/ordered-collection
- @fluidframework/register-collection
- @fluidframework/runtime-definitions
- @fluidframework/runtime-utils
- @fluidframework/sequence
- @fluidframework/shared-object-base
- @fluidframework/shared-summary-block

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver-Definitions
- Driver-Utils
- Protocol-Definitions
- Protocol-Utils
- Runtime

### Test

#### Packages

- @fluid-example/iframe-host
- @fluid-internal/end-to-end-tests
- @fluid-internal/functional-tests
- @fluid-internal/hosts-sample
- @fluid-internal/node-host
- @fluid-internal/test-snapshots
- @fluid-internal/version-test-1
- @fluid-internal/version-test-2
- @fluidframework/local-driver
- @fluidframework/local-web-host
- @fluidframework/test-runtime-utils
- @fluidframework/test-utils
- @fluidframework/webpack-component-loader

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Component
- Container-Definitions
- Driver
- Driver-Definitions
- Driver-Utils
- Framework
- Framework-Utils
- Hosts
- Loader
- Other-Utils
- Protocol-Definitions
- Routerlicious-Driver
- Runtime
- Server-Libs
- Server-Shared-Utils
- Test
- Tool-Utils
- Tools

### Tools

#### Packages

- @fluid-internal/fetch-tool
- @fluid-internal/merge-tree-client-replay
- @fluid-internal/replay-tool
- dice-roller
- generator-fluid

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver
- Driver-Definitions
- Driver-Utils
- Framework
- Framework-Utils
- Loader
- Other-Utils
- Protocol-Definitions
- Routerlicious-Driver
- Runtime
- Tool-Utils

## Definitions

### Base-Definitions

#### Packages

- @fluidframework/common-definitions
- @fluidframework/component-core-interfaces
- @fluidframework/gitresources

### Container-Definitions

#### Packages

- @fluidframework/container-definitions

#### Layers Depended Upon

- Base-Definitions
- Driver-Definitions
- Protocol-Definitions

### Driver-Definitions

#### Packages

- @fluidframework/driver-definitions

#### Layers Depended Upon

- Base-Definitions
- Protocol-Definitions

### Protocol-Definitions

#### Packages

- @fluidframework/protocol-definitions

#### Layers Depended Upon

- Base-Definitions

## Routerlicious

### Routerlicious-Driver

#### Packages

- @fluidframework/routerlicious-driver
- @fluidframework/routerlicious-urlresolver

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver
- Driver-Definitions
- Driver-Utils
- Protocol-Definitions
- Protocol-Utils
- Server-Shared-Utils

### Routerlicious-Server

#### Packages

- @fluidframework/server-routerlicious

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Protocol-Definitions
- Server-Libs
- Server-Shared-Utils

## Server

### Server-Libs

#### Packages

- @fluidframework/server-kafka-orderer
- @fluidframework/server-lambdas
- @fluidframework/server-lambdas-driver
- @fluidframework/server-local-server
- @fluidframework/server-memory-orderer
- @fluidframework/server-services
- @fluidframework/server-services-core
- @fluidframework/server-services-shared
- @fluidframework/server-services-utils
- @fluidframework/server-test-utils

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Protocol-Definitions
- Protocol-Utils
- Server-Libs
- Server-Shared-Utils

### Server-Shared-Utils

#### Packages

- @fluidframework/server-services-client

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Protocol-Definitions
- Protocol-Utils

### Server-Tools

#### Packages

- tinylicious

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Protocol-Definitions
- Protocol-Utils
- Server-Libs
- Server-Shared-Utils

## Utils

### Base-Utils

#### Packages

- @fluidframework/common-utils

#### Layers Depended Upon

- Base-Definitions

### Driver-Utils

#### Packages

- @fluidframework/driver-utils

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Container-Definitions
- Driver-Definitions
- Protocol-Definitions
- Protocol-Utils

### Framework-Utils

#### Packages

- @fluidframework/view-adapters
- @fluidframework/view-interfaces

#### Layers Depended Upon

- Base-Definitions
- Framework-Utils

### Other-Utils

#### Packages

- @fluidframework/odsp-utils

### Protocol-Utils

#### Packages

- @fluidframework/protocol-base

#### Layers Depended Upon

- Base-Definitions
- Base-Utils
- Protocol-Definitions

### Tool-Utils

#### Packages

- @fluidframework/tool-utils

#### Layers Depended Upon

- Other-Utils

