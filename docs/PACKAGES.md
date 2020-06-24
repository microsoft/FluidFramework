# Package Layers

[//]: <> (This file is generated, please don't edit it manually!)

### Base-Definitions

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/common-definitions](/common/lib/common-definitions)</br>- [@fluidframework/component-core-interfaces](/packages/loader/component-core-interfaces)</br>- [@fluidframework/gitresources](/server/routerlicious/packages/gitresources) | &nbsp;</br>&nbsp;</br>&nbsp; |

### Protocol-Definitions

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/protocol-definitions](/server/routerlicious/packages/protocol-definitions) | - [Base-Definitions](#Base-Definitions) |

### Driver-Definitions

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/driver-definitions](/packages/loader/driver-definitions)</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions) |

### Container-Definitions

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/container-definitions](/packages/loader/container-definitions)</br>&nbsp;</br>&nbsp; | - [Base-Definitions](#Base-Definitions)</br>- [Driver-Definitions](#Driver-Definitions)</br>- [Protocol-Definitions](#Protocol-Definitions) |

### Base-Utils

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/common-utils](/common/lib/common-utils) | - [Base-Definitions](#Base-Definitions) |

### Other-Utils

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/odsp-utils](/packages/utils/odsp-utils) | &nbsp; |

### Tool-Utils

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/tool-utils](/packages/utils/tool-utils) | - [Other-Utils](#Other-Utils) |

### Build

| Packages | Layers Depended Upon |
| --- | --- |
| - [@fluidframework/build-common](/common/build/build-common)</br>- [@fluidframework/eslint-config-fluid](/common/build/eslint-config-fluid) | &nbsp;</br>&nbsp; |

