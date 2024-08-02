---
"fluid-framework": minor
"@fluidframework/runtime-utils": minor
---

Add `isFluidHandle` to check if an object is an `IFluidHandle`.

`isFluidHandle` is now exported and can be used to detect which objects are `IFluidHandle`s.
Since `IFluidHandle` often needs special handling (for example when serializing since its not JSON compatible),
having a dedicated detection function for it is handy.
Doing this detection was possible previously using the `tree` package's schema system via `Tree.is(value, new SchemaFactory("").handle)`,
but can now be done with just `isFluidHandle(value)`.
