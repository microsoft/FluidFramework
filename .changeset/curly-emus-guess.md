---
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"@fluidframework/fluid-static": minor
"__section": legacy
---
Remove deprecated beta client-version parameters

Use `oldestSupportedClient` instead of `minVersionForCollab` when you configure the container runtime or its base factory.
Use `oldestSupportedClient` instead of `minVersionForCollaboration` with `createTreeContainerRuntimeFactory`.

```typescript
const factory = createTreeContainerRuntimeFactory({
	schema,
	oldestSupportedClient: "2.80.0",
});
```

The removed beta properties were deprecated before this removal.
This change belongs in the Client 3.10 beta-break window.
Do not merge this preview into an earlier release.
See [the migration issue](https://github.com/microsoft/FluidFramework/issues/27851).

`MinimumVersionForCollab` remains available as a deprecated public alias until Client 4.0.
Cross-layer compatibility aliases, on-disk schema fields, and telemetry property names do not change.
