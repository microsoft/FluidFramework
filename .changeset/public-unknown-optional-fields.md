---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Applications can configure the policy for tolerating unknown optional fields through the public API

`SchemaFactory.object` and `SchemaFactory.objectRecursive` now accept the `allowUnknownOptionalFields` option through the public API.
The option defaults to `true`.

This option controls how an object node's view schema handles optional fields that are declared in the document's stored schema but not in the view schema:

- Set `allowUnknownOptionalFields` to `true` to let an older application version continue to view and edit a document after a newer version upgrades its stored schema to add optional fields, provided the schemas are otherwise compatible.
  The older version cannot access those fields through its view.
  Copying nodes by reading their fields or spreading them into new nodes can drop data in the unknown fields.
- Set `allowUnknownOptionalFields` to `false` to prevent viewing documents whose stored schema declares additional optional fields for that object.
  After a newer application version adds an optional field to the stored schema, older versions with this policy cannot view the document until their view schemas include that field.

Set the option explicitly to choose a policy that does not depend on the default value.
The option does not allow fields absent from the stored schema or make other incompatible schema changes compatible.

```typescript
import { SchemaFactory } from "@fluidframework/tree";

const factory = new SchemaFactory("com.example");

class Person extends factory.object(
	"Person",
	{ name: factory.string },
	{ allowUnknownOptionalFields: false },
) {}
```
