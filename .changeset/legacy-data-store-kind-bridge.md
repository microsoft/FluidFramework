---
"@fluidframework/runtime-utils": minor
"__section": legacy
---
Use legacy data-store factories with alpha ServiceClient APIs

The new `dataStoreKindFromFactory` function in `@fluidframework/runtime-utils/legacy/alpha` lets you use an existing data-store factory as an alpha `DataStoreKind`.
It preserves the original factory, child registry, entry point, and persisted representation without adding wrapper objects.
This supports incremental migration while existing implementations continue to use legacy APIs for named channels and other legacy configuration.

Supply the factory's entry-point type as the generic type argument when needed.
The function does not validate that type or change the container's root-discovery convention.

For applications with other root-discovery conventions, `fluidContainerFromLegacy` exposes an attached legacy container and an application-selected root value through the alpha container API.
It preserves the original container and root without adding persisted objects.
Pass the service-facing reload ID explicitly; a driver's resolved URL ID may instead be an internal identifier such as an ODSP document hash.
Factories used for alpha creation must already be registered in the existing runtime.
