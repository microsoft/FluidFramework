---
"@fluidframework/matrix": major
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
---

sequence: Some function return types are now void instead of any

The return types of some functions have changed from `any` to `void` because the projects are now being compiled with
the `noImplicitAny` TypeScript compilation option. This does not represent a logic change and only serves to make the
typing of these functions more accurate.
