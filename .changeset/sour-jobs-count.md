---
"@fluidframework/container-runtime": minor
"@fluidframework/container-utils": minor
---

Move DeltaManagerProxyBase from container-utils to container-runtime

Moves the `DeltaManagerProxyBase` from `@fluidframework/container-utils` into `@fluidframework/container-runtime`, which is the only place that currently uses it. It is no longer exported, and no replacement API is intended.
