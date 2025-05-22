---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
ForestTypeExpensiveDebug now validates content against schema

When opting into using [ForestTypeExpensiveDebug](https://fluidframework.com/docs/api/fluid-framework/#foresttypeexpensivedebug-variable) using [configuredSharedTree](https://fluidframework.com/docs/api/fluid-framework/#configuredsharedtree-function), the tree is now checked against the schema on load and after every edit.
This should help detect and diagnose document corruption bugs.

```typescript
const DebugSharedTree = configuredSharedTree({
	jsonValidator: typeboxValidator,
	// Now detects corrupted documents which are out of schema.
	forest: ForestTypeExpensiveDebug,
});
```
