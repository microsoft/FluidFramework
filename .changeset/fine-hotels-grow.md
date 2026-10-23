---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add oldestSupportedClient for Tree write-format selection

Use `oldestSupportedClient` to select compatible Tree write formats.
The Tree factory still accepts `minVersionForCollab` during the migration.
If both options are present, `oldestSupportedClient` takes precedence.

```typescript
const tree = configuredSharedTreeBeta({ oldestSupportedClient: "2.80.0" });
```

Tree codec definitions and format snapshots now use `oldestSupportedClient`.
The encoded document formats do not change.
See [the migration issue](https://github.com/microsoft/FluidFramework/issues/27851).
