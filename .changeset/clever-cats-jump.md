---
"fluid-framework": minor
"@fluidframework/map": minor
---

DDS classes are no longer publicly exported

SharedDirectory and SharedTree now only export their factories and the interface types.
The actual concrete classes which leak implementation details are no longer exported.
Users of the `SharedDirectory` type should use `ISharedDirectory`.