---
"@fluidframework/tree": minor
---
---
"section": deprecation
---

Events-related interfaces have been moved to core-interfaces

The following interfaces and types have been moved from the `@fluidframework/tree` package into the
`@fluidframework/core-interfaces` package. As such, they are now deprecated in the `@fluidframework/tree` package.

- Listeners
- IsListener
- Listenable
- Off

Users should now import them from either `@fluidframework/core-interfaces` or `fluid-framework`.

These deprecated interfaces will be removed from the `@fluidframework/tree` package in Fluid Framework v3.0.
