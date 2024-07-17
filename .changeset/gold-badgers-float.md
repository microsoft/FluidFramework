---
"@fluidframework/shared-object-base": minor
---

Added typeguard for SharedObjectKinds

In the 2.0 release of Fluid, the concrete class implementations for DDSes were hidden from Fluid's API surface.
This made `instanceof` checks fail to work correctly.
There were ways to work around this in application code, but they involved boilerplate which required more understanding of Fluid internals than should be necessary.
This change adds a drop-in replacement to `instanceof`: the `.is()` method to `SharedObjectKind`.
For example:

```typescript
// Works in FluidFramework 1.0 but not in the initial release of FluidFramework 2.0:
if (myObject instanceof SharedString) {
	// do something
}

// With this change, that code can now be written like so:
if (SharedString.is(myObject)) {
	// do something
}
```
