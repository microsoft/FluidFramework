---
"fluid-framework": minor
---

fluid-framework: Moved SharedMap to 'fluid-framework/legacy'

Please use SharedTree for new containers.  SharedMap is supported for loading preexisting Fluid Framework 1.x containers only.

Fluid Framework 1.x users migrating to Fluid Framework 2.x will need to import SharedMap from the './legacy' import path.

```ts
import { SharedMap } from "fluid-framework/legacy";
```
