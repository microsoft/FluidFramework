---
"fluid-framework": minor
"@fluidframework/map": minor
"@fluidframework/tree": minor
---

map, tree: DDS classes are no longer publicly exported

SharedMap and SharedTree now only export their factories and the interface types.
The actual concrete classes which leak implementation details are no longer exported.
Users of the `SharedMap` type should use `ISharedMap`.
Users of the `SharedTree` type should use `ISharedTree`.
