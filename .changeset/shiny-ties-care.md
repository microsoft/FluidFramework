---
"@fluidframework/core-interfaces": minor
"@fluidframework/telemetry-utils": minor
---

Cleaning up duplicate or misnamed telemetry types

We have two sets of telemetry-related interfaces:

-   The "Base" ones
    -   These have a very bare API surface
    -   They are used on public API surfaces to transmit logs across layers
-   The internal ones
    -   These have a richer API surface (multiple log functions with different categories,
        support for logging flat arrays and objects)
    -   They are used for instrumenting our code, and then normalize and pass off the logs via the Base interface

There are two problems with the given state of the world:

1. The "Base" ones were not named consistently, so the distinction was not as apparent as it could be
2. The internal ones were duplicated in the process of extending the supported types

This change addresses these by adding "Base" to the name of each base type, and deprecating the old duplicate internal types.
