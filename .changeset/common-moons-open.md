---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix adaptEnum's handling of numeric enums

Enum entries whose values are numeric get additional properties on TypeScript's generated Enum object.
These values were getting treated like enum entries at runtime by `adaptEnum` (`@beta`).
This has been fixed and the runtime behavior now matches the types in this case.

If any documents were created with this API which were impacted by this bug and keeping them openable is required, they will need a workaround.
Impacted schema using the union from `adaptEnum` can need to be updated to explicitly include the previously erroneously generated schema.

Before:
```typescript
enum Mode {
	a = 1,
}
const ModeNodes = adaptEnum(schemaFactory, Mode);
const union = ModeNodes.schema;
```

After:
```typescript
enum Mode {
	a = 1,
}
const ModeNodes = adaptEnum(schemaFactory, Mode);
// Bugged version of adaptEnum used to include this: it should not be used but must be included in the schema for legacy document compatibility.
class Workaround extends schemaFactory.object("a", {}) {}
const union = [...ModeNodes.schema, Workaround] as const;
```

To help detect when schema contain unexpected content, and to ensure workarounds like this are implemented properly, applications should include tests which check the schema for compatibility.
See [tree-cli-app's schema tests](https://github.com/microsoft/FluidFramework/blob/main/examples/apps/tree-cli-app/src/test/schema.spec.ts) for an example of how to do this.

The schema returned by `adaptEnum` have also been updated to `toString` more usefully, including the value of the particular enum entry: this has no effect on the nodes, just the schema.
