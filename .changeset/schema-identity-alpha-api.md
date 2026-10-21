---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Simplify the alpha schema identity API

The alpha `identifySchema` function is renamed to [`identifySchemaAlpha`](https://fluidframework.com/docs/api/tree#identifyschemaalpha-function).
The alpha `computeSchemaHash` function is no longer exported.
To check a schema against an expected hash, pass a schema identity to the view configuration:

```typescript
const config = new TreeViewConfigurationAlpha({
	schema: MySchema,
	schemaIdentity: identifySchemaAlpha({ expectedHash: savedHash }),
});
```

If the expected hash does not match, the view construction error includes the actual hash.
