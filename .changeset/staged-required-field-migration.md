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
   The stored schema remains `Optional`, so version N clients are unaffected and documents they created remain
   viewable. Because such a document may contain a node where the field is empty, the field is also `Optional` in the
   view schema (and reads are typed `T | undefined`) during this phase: that is the only shape which honestly
   describes every document this client can open.
   What this step changes is that a version N+1 client never *creates* an empty value: constructing a node without a
   value for the field, assigning or inserting `undefined`, and deleting the field all throw a `UsageError` at
   runtime. The same applies to content built from an existing tree or its serialized form (`TreeAlpha.create`,
   `TreeAlpha.importVerbose`, `TreeAlpha.importCompressed`, `TreeBeta.clone` and `TreeView.initialize`): importing or
   cloning content in which the field is empty throws rather than silently reintroducing an empty value.
   These are runtime rather than compile-time errors because TypeScript mapped types cannot make the write
   type of a property required while its read type is optional — the same limitation `stagedOptional` works around.
3. Once version N clients are extinct, the application explicitly enables the staged upgrade by configuring the view
   with a `StagedSchemaUpgradePolicy` whose `includeStagedRequired` returns `true` for the field's upgrade and calling
   `TreeView.upgradeSchema`, which tightens the stored field kind from `Optional` to `Required`.
   (`extractPersistedSchema` exposes the same opt-in, but only for dumping a schema snapshot: it does not upgrade a
   document.)
   Without that opt-in, `TreeView.upgradeSchema` leaves this staged change as a no-op.
4. Version N+2 uses `sf.required(T)` and drops the staged marker. Only at this point does the field become
   non-optional in the TypeScript types.

```typescript
class Point extends sf.objectAlpha("Point", {
	x: sf.number,
	y: sf.stagedRequired(sf.number),
}) {}
```

Nothing is scanned or materialized when opening a document or creating a view, and no value is synthesized or written
during reads.

Operational precondition: step 3 assumes version N clients have been phased out. A `stagedRequired` client refuses to
clear the field itself, so the remaining race is limited to concurrent clients from two rollout generations behind.
This is not a guarantee of safety against arbitrarily old concurrent clients.
