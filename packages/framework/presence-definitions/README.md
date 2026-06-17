# @fluid-internal/presence-definitions

This is an internal package containing common interfaces for API and between internal layers.
`presence` APIs should be accessed via `@fluidframework/presence` package.

## Exports and source organization

- "." (root files exposed via ./index.ts) - public APIs
- "./internal" (./internal.ts) - common internal interfaces and utilities
- "./internal/workspace" - internal interfaces for `workspace` layer or its dependents
- "./internal/workspace-runtime" - interfaces spanning `workspace` and `runtime` layers boundary
- "./internal/workspace-states" - interfaces spanning `workspace` and `states` layers boundary
