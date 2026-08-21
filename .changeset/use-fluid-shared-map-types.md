---
"@fluidframework/map": minor
"__section": breaking
---
Shared maps use Fluid-owned map types

[`IDirectory`](https://fluidframework.com/docs/api/map/idirectory-interface) and [`ISharedMap`](https://fluidframework.com/docs/api/map/isharedmap-interface) now extend the Fluid-owned [`FluidMap`](https://fluidframework.com/docs/api/core-interfaces/fluidmap-interface) interface instead of TypeScript's built-in `Map` interface.
[`IDirectoryBeta`](https://fluidframework.com/docs/api/map/idirectorybeta-interface) has been removed because `IDirectory` now provides the Fluid-owned map contract.

#### Migration

Consumers using `IDirectoryBeta` should use `IDirectory` instead.
Methods available only on newer built-in map types are not available on shared maps.

Before:

```typescript
import type { IDirectoryBeta as Directory } from "@fluidframework/map/legacy";

function visitDirectory(directory: Directory): void {
	// ...
}
```

After:

```typescript
import type { IDirectory as Directory } from "@fluidframework/map/legacy";

function visitDirectory(directory: Directory): void {
	// ...
}
```
