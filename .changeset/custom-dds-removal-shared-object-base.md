---
"@fluidframework/shared-object-base": major
"__section": breaking
---

SharedObject, SharedObjectCore, ISharedObject, ISharedObjectEvents, createSharedObjectKind, and ISharedObjectKind are now internal

These APIs are intended for internal Fluid Framework use only. External implementations
of custom DDSes are not supported. These exports have been moved to internal and are
no longer available in the public API.

Applications should use SharedTree or another existing DDS type (SharedMap, SharedCell, etc.)
rather than implementing custom DDSes. The `SharedObjectKind` type remains public as the
safe, sealed type for referencing DDS kinds.
