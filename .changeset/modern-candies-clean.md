---
"@fluidframework/presence": minor
"__section": breaking
---
Removal of number key support in LatestMap

`number` keys have never been successfully propagated as `number`s at runtime and this type clarification makes that clear. See [issue 25919](https://github.com/microsoft/FluidFramework/issues/25919) for more details.
