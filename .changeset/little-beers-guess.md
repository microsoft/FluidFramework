---
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"@fluidframework/runtime-utils": minor
"__section": legacy
---
Require an explicit oldest supported client when creating container runtimes

The beta `loadContainerRuntime` entry point and Aqueduct runtime factories no longer choose a
compatibility version when one is omitted. Callers must specify exactly one of
`oldestSupportedClient` or the deprecated `minVersionForCollab` property. The alpha
`loadContainerRuntimeAlpha` entry point requires `oldestSupportedClient`.

Migrate callers to the canonical property:

```typescript
const runtime = await loadContainerRuntime({
	// Other runtime parameters...
	oldestSupportedClient: "2.0.0",
});
```

See [microsoft/FluidFramework#27180](https://github.com/microsoft/FluidFramework/issues/27180) for more information.
