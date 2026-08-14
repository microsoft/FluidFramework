---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Remove the deprecated TreeAlpha.branch API

The deprecated alpha `TreeAlpha.branch(node)` API has been removed. Use `TreeAlpha.context(node)` and check `isBranch()` to access the untyped view for a hydrated node:

```typescript
const context = TreeAlpha.context(node);
if (context.isBranch()) {
    // `context` is an UntypedTreeViewAlpha here.
}
```
