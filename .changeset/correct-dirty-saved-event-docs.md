---
"@fluidframework/container-definitions": minor
"__section": fix
---
Correct dirty and saved event transition documentation

The `IContainerEvents` documentation now correctly states that the `"dirty"` event represents `isDirty` changing from `false` to `true`, while the `"saved"` event represents it changing from `true` to `false`.
