---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Improve strictness of input tree types when non-exact schema are provided

Consider the following code where the type of the schema is not exactly specified:

```typescript
const schemaFactory = new SchemaFactory("com.myApp");
class A extends schemaFactory.object("A", {}) {}
class B extends schemaFactory.array("B", schemaFactory.number) {}

// Gives imprecise type (typeof A | typeof B)[]
const schema = [A, B];

const config = new TreeViewConfiguration({ schema });
const view = sharedTree.viewWith(config);

// Does not compile since setter for root is typed `never` due to imprecise schema.
view.root = [];
```

The assignment of `view.root` is disallowed since the same schema type could be either of:

```typescript
const schema: (typeof A | typeof B)[] = [A];
```

```typescript
const schema: (typeof A | typeof B)[] = [B];
```

To avoid this ambiguity, use one of the following patterns:

```typescript
const schema = [A, B] as const;
const config = new TreeViewConfiguration({ schema });
```

```typescript
const config = new TreeViewConfiguration({ schema: [A, B] });
```

To help update existing code which accidentally depended on this bug, an `@alpha` API `unsafeArrayToTuple` has been added.
Many usages of this API will produce incorrectly typed outputs. However, when given `AllowedTypes` arrays which should not contain any unions, but that were accidentally flattened to a single union, it can fix them:

```typescript
// Gives imprecise type (typeof A | typeof B)[]
const schemaBad = [A, B];
// Fixes the type to be [typeof A, typeof B]
const schema = unsafeArrayToTuple(schemaBad);

const config = new TreeViewConfiguration({ schema });
```
