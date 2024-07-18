---
"@fluidframework/shared-object-base": minor
---

Type guards for DDS types

In the 2.0 release of Fluid, the concrete class implementations for DDSes were hidden from Fluid's API surface.
This made `instanceof` checks fail to work correctly.
There were ways to work around this in application code, but they involved boilerplate which required more understanding of Fluid internals than should be necessary.

There is now a drop-in replacement to `instanceof`: the static `.is()` method to `SharedObjectKind`, which is available
on all DDSes.
For example:

```typescript
// Works in Fluid Framework 1.0 but not in the initial release of FluidFramework 2.0:
if (myObject instanceof SharedString) {
	// do something
}

// In Fluid Framework 2.0 and beyond, that code can now be written like so:
if (SharedString.is(myObject)) {
	// do something
}
```
