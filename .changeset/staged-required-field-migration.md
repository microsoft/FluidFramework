---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Add staged optional-to-required field migration API

`SchemaFactoryAlpha.stagedRequired` (and `stagedRequiredRecursive` for recursive schema) allow migrating a field from
optional to required without a coordinated deployment, analogous in rollout shape to
`SchemaFactoryAlpha.stagedOptional` and `SchemaStaticsBeta.staged`.

The rollout is:

1. Version N uses `sf.optional(T)`.
2. Version N+1 uses `sf.stagedRequired(T)`.
   In the view schema (and in the TypeScript types) the field is required: it must be supplied when constructing nodes,
   and it cannot be assigned or inserted as `undefined`, nor deleted.
   The stored schema however remains `Optional`, so version N clients are unaffected and documents they created remain
   viewable.
3. Once version N clients are extinct, the application explicitly enables the staged upgrade
   (`StagedSchemaUpgradePolicy.includeStagedRequired`, also reachable via `extractPersistedSchema`), which
   tightens the stored field kind from `Optional` to `Required`.
   Without that opt-in, `TreeView.upgradeSchema` leaves this staged change as a no-op.
4. Version N+2 uses `sf.required(T)` and drops the staged marker.

```typescript
class Point extends sf.objectAlpha("Point", {
	x: sf.number,
	y: sf.stagedRequired(sf.number),
}) {}
```

Because a document may still contain a node where the field is empty, this is enforced lazily: opening a document and
creating a view never scan or materialize the tree, and unrelated parts of the document remain usable.
Reading that specific field throws a `UsageError` describing the missing value; no value is synthesized and nothing is
written during reads.

To test for presence without `try`/`catch`, use `TreeAlpha.child(node, key)` for object fields (it returns `undefined`
when the field is empty) and the new `TreeViewAlpha.isRootPresent()` for the root field.

Operational precondition: step 3 assumes version N clients have been phased out. A `stagedRequired` client refuses to
clear the field itself, so the remaining race is limited to concurrent clients from two rollout generations behind.
This is not a guarantee of safety against arbitrarily old concurrent clients.
