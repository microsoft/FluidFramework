---
"fluid-framework": minor
"@fluidframework/map": minor
---

fluid-framework: Moved SharedMap to '@fluidframework/map/legacy'

Please use SharedTree for new containers.  SharedMap is supported for loading preexisting Fluid Framework 1.x containers only.

Fluid Framework 1.x users migrating to Fluid Framework 2.x will need to append '/legacy' when importing SharedMap.

```ts
import { SharedMap } from "@fluidframework/map/legacy";
```
