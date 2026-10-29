---
"@fluidframework/runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/test-runtime-utils": minor
"__section": legacy
---
Add oldestSupportedClient across runtime layers

Runtime and data store contexts now expose the required `oldestSupportedClient` property beside `minVersionForCollab`.
Consumers can use `context.oldestSupportedClient` directly instead of `context.minVersionForCollab`.
The runtime retains its internal fallback for older contexts that expose only `minVersionForCollab`, so mixed-version packages remain supported.

```typescript
const oldestSupportedClient = context.oldestSupportedClient;
```

The on-disk schema and telemetry property names do not change.
See [the migration issue](https://github.com/microsoft/FluidFramework/issues/27851) for more details.
