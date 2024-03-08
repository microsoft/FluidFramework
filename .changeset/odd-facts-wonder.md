---
"@fluidframework/runtime-definitions": minor
---

runtime-definitions: FlushMode.Immediate is deprecated

`FlushMode.Immediate` is deprecated and will be removed in the next major version. It should not be used. Use
`FlushMode.TurnBased` instead, which is the default. See
<https://github.com/microsoft/FluidFramework/tree/main/packages/runtime/container-runtime/src/opLifecycle#how-batching-works>
for more information
