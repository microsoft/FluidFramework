---
"fluid-framework": minor
"@fluidframework/fluid-static": minor
"@fluidframework/map": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/tree": minor
---

Replace SharedObjectClass with new ISharedObjectKind type.

The static objects used as SharedObjectClass now explicitly implement the new ISharedObjectKind type.
SharedObjectClass has been removed as ISharedObjectKind not filles that role.
LoadableObjectCtor has been inlined as it only had one use: an external user of it can replace it with `(new (...args: any[]) => T)`.
