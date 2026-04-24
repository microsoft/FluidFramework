---
"@fluidframework/tree": minor
"__section": feature
---
Add SchemaFactoryAlpha.stagedOptionalRecursive for recursive staged-optional fields

`SchemaFactoryAlpha.stagedOptionalRecursive(T)` is the recursive-type variant of `stagedOptional` (released in [2.93.0](https://github.com/microsoft/FluidFramework/pull/26918)). Use it for schemas whose types are recursive - the relaxed type constraints work around TypeScript's limitations with recursive schema definitions. Pair it with `ValidateRecursiveSchema` for improved type safety.

Example:

```typescript
const sf = new SchemaFactoryAlpha("my-app");
class TreeNode extends sf.objectRecursiveAlpha("TreeNode", {
	value: sf.number,
	child: sf.stagedOptionalRecursive([() => TreeNode]),
}) {}
type _check = ValidateRecursiveSchema<typeof TreeNode>;
```

See `stagedOptional` for the migration pattern (required to stagedOptional to optional).
