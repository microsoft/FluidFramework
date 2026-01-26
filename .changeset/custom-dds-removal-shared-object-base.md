---
"@fluidframework/shared-object-base": minor
"__section": other
---

SharedObject, SharedObjectCore, ISharedObject, ISharedObjectEvents, createSharedObjectKind, and ISharedObjectKind will be removed from the public API

These APIs will be deprecated in version 2.90.0 and removed (moved to internal) in version 2.100.0. These APIs are intended for internal Fluid Framework use only. External implementations of custom DDSes are not supported.

Applications should use SharedTree or another existing DDS type (SharedMap, SharedCell, etc.) rather than implementing custom DDSes. The `SharedObjectKind` type will remain public as the safe, sealed type for referencing DDS kinds.
