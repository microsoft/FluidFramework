---
"@fluidframework/map": minor
"__section": breaking
---
Shared maps use Fluid-owned map types

`IDirectory` and `ISharedMap` now extend the Fluid-owned `FluidMap` interface instead of TypeScript's built-in `Map` interface.
`IDirectoryBeta` has been removed because `IDirectory` now provides the Fluid-owned map contract.

#### Migration

Consumers using `IDirectoryBeta` should use `IDirectory` instead.
Methods available only on newer built-in map types are not available on shared maps.
