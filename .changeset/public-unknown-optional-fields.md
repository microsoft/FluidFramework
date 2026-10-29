---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Applications can configure the policy for tolerating unknown optional fields through the public API

`SchemaFactory.object` and `SchemaFactory.objectRecursive` now accept the public `ObjectSchemaOptions`.
Set `allowUnknownOptionalFields` to `true` to let a view schema tolerate optional fields that exist only in the stored schema.

```typescript
import { SchemaFactory } from "@fluidframework/tree";

const factory = new SchemaFactory("com.example");

class Person extends factory.object(
	"Person",
	{ name: factory.string },
	{ allowUnknownOptionalFields: true },
) {}
```
