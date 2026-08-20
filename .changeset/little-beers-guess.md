---
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"__section": legacy
---
Require an explicit oldest supported client when creating container runtimes

Container runtime entry points and Aqueduct runtime factories no longer choose a compatibility
version when one is omitted. Callers must specify exactly one of `oldestSupportedClient` or the
deprecated `minVersionForCollab` property.

Migrate callers to the canonical property:

```typescript
const runtime = await loadContainerRuntime({
	// Other runtime parameters...
	oldestSupportedClient: "2.0.0",
});
```

See [microsoft/FluidFramework#27180](https://github.com/microsoft/FluidFramework/issues/27180) for more information.
