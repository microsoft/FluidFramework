---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Applications can configure the policy for tolerating unknown optional fields through the public API

[`SchemaFactory.object`](https://fluidframework.com/docs/api/tree/schemafactory-class#object-method) and [`SchemaFactory.objectRecursive`](https://fluidframework.com/docs/api/tree/schemafactory-class#objectrecursive-method) now accept the [`allowUnknownOptionalFields`](https://fluidframework.com/docs/api/tree/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) option through the public API.
The option defaults to `true`.

This option controls how an object node's view schema handles optional fields that are declared in the document's stored schema but not in the view schema:

- Set `allowUnknownOptionalFields` to `true` to let an older application version continue to view and edit a document after a newer version adds new optional fields to the object schema, provided the schemas are otherwise compatible.
  The older version cannot access those fields through its view.
  Copying nodes by reading their fields or spreading them into new nodes can drop data in the unknown fields.
- Set `allowUnknownOptionalFields` to `false` to prevent viewing documents whose stored schema declares additional optional fields for that object.
  After a newer application version adds an optional field to the object schema, older versions with this policy cannot view the document until their view schemas include that field.

```typescript
import { SchemaFactory } from "@fluidframework/tree";

const factory = new SchemaFactory("com.example");

class Person extends factory.object(
	"Person",
	{ name: factory.string },
	// Reject documents with additional optional fields on Person.
	{ allowUnknownOptionalFields: false },
) {}
```

The beta `ObjectSchemaOptions` type is renamed to `ObjectSchemaOptionsBeta`.
If you reference the beta type directly, update those references to the new name.
