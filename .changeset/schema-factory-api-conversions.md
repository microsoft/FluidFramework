---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Make SchemaFactory alpha and beta APIs easier to access

Use `asBeta` and `asAlpha` to access experimental APIs on a factory created with the public `SchemaFactory` constructor.
Both functions return the same factory, preserving its scope and cached schemas.
You can keep using the public API elsewhere without changing the factory declaration.

```typescript
import { SchemaFactory } from "@fluidframework/tree";
import { asBeta } from "@fluidframework/tree/beta";
import { asAlpha } from "@fluidframework/tree/alpha";

const factory = new SchemaFactory("com.example");
const allowedTypes = asBeta(factory).types([factory.string, factory.number]);
class Item extends asAlpha(factory).objectAlpha("Item", {
	value: allowedTypes,
	count: asAlpha(factory).withDefault(factory.required(factory.number), 0),
}) {}
```
