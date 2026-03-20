---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Replaced `hasRootSchema` with `isViewOf`

`TreeBranchAlpha.hasRootSchema` has been deprecated in favor of `TreeBranchAlpha.isViewOf`.
Migrating to the new method is trivial:

```ts
view.hasRootSchema(MySchema);
// becomes:
view.isViewOf(MySchema);
```

The schema parameter may be omitted from `isViewOf` in order to check if a branch is a view without knowing the schema.
