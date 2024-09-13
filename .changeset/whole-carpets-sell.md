---
"@fluidframework/tree": minor
---
---
"section": "tree"
---
Make SharedTree usable with legacy APIs

SharedTree was not previously exported in a way that made it usable with @fluidframework/aqueduct or other lower-level legacy APIs. This fixes that issue by making it consistent with other DDSes: such usages can `import { SharedTree } from "@fluidframework/tree/legacy";`.
