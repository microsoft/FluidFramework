---
"fluid-framework": major
"@fluidframework/map": major
---

DDS classes are no longer publicly exported

SharedDirectory now only exports its factory and the interface type.
The actual concrete classes which leak implementation details are no longer exported.
Users of the `SharedDirectory` type should use `ISharedDirectory`.

Most of other internal crufts are also hided within the API surface, such as the encoded format, 
ILocalValue, ICreateInfo, local op metadata types, etc.