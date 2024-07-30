---
"fluid-framework": minor
"@fluidframework/runtime-utils": minor
---
---
section: feature
---

New `isFluidHandle` type guard to check if an object is an `IFluidHandle`

The `isFluidHandle` type guard function is now exported and can be used to detect which objects are `IFluidHandle`s.
Since `IFluidHandle` often needs special handling (for example when serializing since it's not JSON compatible),
having a dedicated detection function for it is useful.
Doing this detection was possible previously using the `tree` package's schema system via `Tree.is(value, new SchemaFactory("").handle)`,
but can now be done with just `isFluidHandle(value)`.
