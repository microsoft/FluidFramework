---
"@fluidframework/driver-definitions": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---
Use one kind and creator model for shared objects and data stores

The experimental ServiceClient APIs now use `DataStoreKind`, `DataStoreKey`, `DataStoreRegistry`, and `DataStoreCreator` for both framework-provided shared objects and application-defined data stores.
Use `createDataStore` in initialization callbacks instead of `createSharedObject`, and use `dataStoreRegistryFromIterable` instead of `sharedObjectRegistryFromIterable`.
Registries now resolve individual kinds asynchronously.

`SharedTreeAlpha` and `configuredSharedTreeAlpha` produce data-store kinds.
They can be container roots or additional container-level items.
Composite data stores can also be roots and additional contents of other data stores.
Direct container-level shared objects and native nested data stores require `oldestSupportedClient` of at least `3.12.0`.
DDS-only stores remain available at older targets using their existing representation.
Existing DDS children retain their identities, summary layout, and operation format when loaded by the generalized collection.
Composite children can be added alongside them after framework-version and application rollout requirements are satisfied.

Application-facing data-store values do not need to expose handles.
Nested data stores share the garbage-collection lifetime of their container-level ancestor.

This changes experimental alpha signatures and removes the separate alpha shared-object creator, registry, and key abstractions.
The stable shared-object APIs remain unchanged.
