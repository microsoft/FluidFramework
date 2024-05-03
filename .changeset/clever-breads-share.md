---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/map": minor
"@fluidframework/matrix": minor
"@fluidframework/ordered-collection": minor
"@fluidframework/register-collection": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/sequence": minor
"@fluid-experimental/sequence-deprecated": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/synthesize": minor
"@fluid-experimental/tree": minor
"@fluidframework/tree": minor
---

Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface

Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.
