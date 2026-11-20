---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree schema authors can deprecate allowed types

Use `SchemaFactoryAlpha.deprecated()` or `SchemaFactoryAlpha.deprecatedRecursive()` to stop introducing a type into new documents while keeping existing documents usable.
A document that already permits the type still supports reads and writes of that type.
Deprecating an allowed type does not remove stored types nor migrate data in existing documents.

```typescript
import { SchemaFactoryAlpha, type ValidateRecursiveSchema } from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryAlpha("notes");

// New notes use string colors. The view still accepts numbers in documents that permit them.
class Note extends sf.object("Note", {
    color: sf.types([sf.string, sf.deprecated(sf.number)]),
}) {}

// New outlines contain only strings. Older documents may also allow nested outlines.
class Outline extends sf.arrayRecursive("Outline", sf.typesRecursive([
    sf.string,
    sf.deprecatedRecursive(() => Outline),
])) {}
type _CheckOutline = ValidateRecursiveSchema<typeof Outline>;
```
