---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Add Fluid-controlled map and iterator interfaces

`TreeIndex` now extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap`, and `TreeMapNodeAlpha` which extends `FluidReadonlyMap` instead of the built-in `ReadonlyMap` has been added.
This works to uncouple Fluid's public API surface to the TypeScript standard library's map types, preventing future breakage when those types change.
