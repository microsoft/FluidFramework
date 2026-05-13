---
"@fluidframework/map": minor
"__section": legacy
---

Add legacy beta map compatibility interfaces

New legacy beta map interfaces make it possible to type legacy map-like DDS APIs against Fluid's stable map abstraction while preserving the legacy DDS `get` and `set` APIs.

```typescript
import type { FluidMapLegacy, IDirectoryBeta, ISharedMapBeta } from "@fluidframework/map/legacy";

declare const directory: IDirectoryBeta;
declare const sharedMap: ISharedMapBeta;

const directoryMap: FluidMapLegacy<string, unknown> = directory;
const sharedMapAsLegacyMap: FluidMapLegacy<string, unknown> = sharedMap;
```
