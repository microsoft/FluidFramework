---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Remove the deprecated TreeAlpha.branch API

The deprecated alpha `TreeAlpha.branch(node)` API has been removed. Use [`TreeAlpha.context(node)`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#context-methodsignature) and check [`isView()`](https://fluidframework.com/docs/api/fluid-framework/treecontextalpha-interface#isview-methodsignature) to access the untyped view for a hydrated node:

```typescript
const context = TreeAlpha.context(node);
if (context.isView()) {
    // `context` is an UntypedTreeViewAlpha here.
}
```
