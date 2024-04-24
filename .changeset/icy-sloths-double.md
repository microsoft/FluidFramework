---
"@fluidframework/matrix": minor
---

SharedMatrix class hidden

The `SharedMatrix` class has been hidden from the alpha API.
In its place:

-   The constant `SharedMatrix` is exposed as the entrypoint for `SharedMatrix` creation. See documentation on `ISharedObjectKind`.
-   The type `SharedMatrix` is aliased to `ISharedMatrix`, which contains matrix's public API. This API has no semantic changes from previous versions.

Additionally, `SharedMatrixFactory` has been deprecated. Rather than construct the factory directly, use `SharedMatrix.getFactory()` (e.g. for usage in `DataObject` registries).

This change is part of a larger effort to clean up the API surface of various DDSes we have to leak less implementation details. See e.g. #20030.
Most code which uses `SharedMatrix` should continue to function without changes.
