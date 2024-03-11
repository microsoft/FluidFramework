---
"fluid-framework": minor
"@fluidframework/map": minor
---

DDS classes are no longer publicly exported

SharedDirectory now only exports its factory and the interface type.
The actual concrete classes which leak implementation details are no longer exported.
Users of the `SharedDirectory` type should use `ISharedDirectory`.