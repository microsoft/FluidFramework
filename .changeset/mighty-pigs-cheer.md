---
"@fluidframework/driver-definitions": minor
"fluid-framework": minor
---

Make several driver types no longer public

Move the following types from `@public` to `@alpha`:

-   ITokenClaims
-   IDocumentMessage
-   IClientConfiguration
-   IAnyDriverError
-   IDriverErrorBase
-   DriverErrorTypes

`DriverErrorTypes` is no longer exported from the `fluid-framework` package.
