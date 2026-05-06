---
"@fluidframework/core-interfaces": minor
"@fluidframework/map": minor
"__section": legacy
---

Add legacy beta map compatibility interfaces

New legacy beta map interfaces make it possible to type legacy map-like DDS APIs against Fluid's stable map abstraction while preserving compatibility with JavaScript `Map` consumers.

```typescript
import type { FluidMapLegacy } from "@fluidframework/core-interfaces/legacy";
import type { IDirectoryBeta, ISharedMapBeta } from "@fluidframework/map/legacy";

declare const directory: IDirectoryBeta;
declare const sharedMap: ISharedMapBeta;

const directoryMap: FluidMapLegacy<string, unknown> = directory;
const sharedMapAsMap: Map<string, unknown> = sharedMap;
```
